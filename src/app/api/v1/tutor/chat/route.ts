import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { askTutor, type TutorMessage } from "../../../../../lib/tutor-ai";

function validHistory(value: unknown): TutorMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is TutorMessage => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as { role?: unknown; content?: unknown };
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-6);
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const body = await request.json().catch(() => null);
  const practiceQuestionId =
    typeof body?.practiceQuestionId === "string" ? body.practiceQuestionId : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!practiceQuestionId || !message || message.length > 1500) {
    return jsonError(400, "INVALID_INPUT", "请选择练习题并输入不超过 1500 字的提问");
  }

  const question = await prisma.practiceQuestion.findUnique({
    where: { id: practiceQuestionId },
    include: { practiceSet: true },
  });
  if (!question) {
    return jsonError(404, "PRACTICE_QUESTION_NOT_FOUND", "练习题不存在");
  }

  const studentId = question.practiceSet.studentId;
  if (auth.user.role === "FAMILY") {
    const family = await prisma.familyAccount.findUnique({
      where: { userId: auth.user.id },
      include: { student: true },
    });
    if (family?.student?.id !== studentId) {
      return jsonError(403, "FORBIDDEN", "只能咨询自己的练习题");
    }
  } else if (auth.user.role === "TEACHER") {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    if (!(teacher?.assignments ?? []).some((item) => item.studentId === studentId)) {
      return jsonError(403, "FORBIDDEN", "只能咨询自己负责学生的练习题");
    }
  }

  try {
    const reply = await askTutor({
      question: question.question,
      expectedAnswer: question.answer,
      explanation: question.explanation,
      message,
      history: validHistory(body?.history),
    });
    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error("[tutor] request failed", error);
    return jsonError(503, "TUTOR_UNAVAILABLE", "AI 老师暂时不可用，请稍后再试");
  }
}
