// PATCH /api/v1/teacher/wrong-questions/:id/review：老师审核覆盖 AI 结构化结果
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../../lib/csrf";
import { prisma } from "../../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../../lib/http";
import {
  teacherReviewTx,
  WrongQuestionError,
} from "../../../../../../../lib/wrong-question";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonError(400, "INVALID_INPUT", "请求体不能为空");
  }

  try {
    await teacherReviewTx(prisma, id, {
      recognizedQuestion: body.recognizedQuestion,
      finalAnswer: body.finalAnswer,
      correctSteps: body.correctSteps,
      thinkingHint: body.thinkingHint,
      errorCauses: body.errorCauses,
      knowledgePoints: body.knowledgePoints,
      difficulty: body.difficulty,
      aiConfidence: body.aiConfidence,
      remedialPractice: body.remedialPractice,
      teacherNote: body.teacherNote,
      errorType: body.errorType,
      mastered: body.mastered,
    }, auth.user.id);

    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "TEACHER_REVIEW",
      targetType: "WrongQuestion",
      targetId: id,
      summary: "老师审核了 AI 错题分析",
      ip: getClientIp(request),
    });

    return NextResponse.json({ success: true, data: { wrongQuestionId: id } });
  } catch (error) {
    if (error instanceof WrongQuestionError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
