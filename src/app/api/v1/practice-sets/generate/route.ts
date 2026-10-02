// POST /api/v1/practice-sets/generate：为家庭或负责学生生成数学模拟题
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import { PracticeAiError } from "../../../../../lib/practice-ai";
import {
  generatePracticeSetTx,
  PracticeSetError,
} from "../../../../../lib/practice-set";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const requestedStudentId = typeof body?.studentId === "string" ? body.studentId : "";
  const count = body?.count === undefined ? 5 : Number(body.count);
  const rawIds = body?.wrongQuestionIds;
  const wrongQuestionIds = rawIds === undefined
    ? undefined
    : Array.isArray(rawIds) && rawIds.every((id: unknown) => typeof id === "string" && id.length > 0)
      ? [...new Set(rawIds as string[])]
      : null;
  const difficulty = body?.difficulty;
  if (!Number.isInteger(count) || count < 3 || count > 5) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "count 必须是 3 至 5 的整数",
    );
  }
  if (wrongQuestionIds === null || (wrongQuestionIds && (wrongQuestionIds.length === 0 || wrongQuestionIds.length > 20))) {
    return jsonError(400, "INVALID_INPUT", "所选错题数量必须是 1 至 20 道");
  }
  if (difficulty !== undefined && difficulty !== "EASY" && difficulty !== "MEDIUM" && difficulty !== "HARD") {
    return jsonError(400, "INVALID_INPUT", "difficulty 必须是 EASY / MEDIUM / HARD");
  }

  let studentId = requestedStudentId;
  if (auth.user.role === "FAMILY") {
    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: auth.user.id },
      include: { student: true },
    });
    if (!familyAccount?.student) {
      return jsonError(404, "STUDENT_NOT_FOUND", "当前家庭账号未绑定学生");
    }
    if (requestedStudentId && requestedStudentId !== familyAccount.student.id) {
      return jsonError(403, "FORBIDDEN", "只能为自己的学生生成数学练习");
    }
    studentId = familyAccount.student.id;
  } else if (!studentId) {
    return jsonError(400, "INVALID_INPUT", "请选择学生");
  }

  if (auth.user.role === "TEACHER") {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    const isAssigned = (teacherProfile?.assignments ?? []).some(
      (assignment) => assignment.studentId === studentId,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能为自己负责的学生生成模拟题");
    }
  }

  try {
    const practiceSet = await generatePracticeSetTx(prisma, {
      studentId,
      count,
      ...(wrongQuestionIds ? { wrongQuestionIds } : {}),
      ...(difficulty ? { difficulty } : {}),
    });
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "GENERATE_PRACTICE_SET",
      targetType: "PracticeSet",
      targetId: practiceSet.id,
      summary: `生成数学模拟题组：${practiceSet.title}`,
      ip: getClientIp(request),
    });
    return NextResponse.json({
      success: true,
      data: {
        id: practiceSet.id,
        studentId: practiceSet.studentId,
        studentName: practiceSet.student.name,
        title: practiceSet.title,
        questions: practiceSet.questions,
        createdAt: practiceSet.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof PracticeSetError) {
      return jsonError(error.status, error.code, error.message);
    }
    if (error instanceof PracticeAiError) {
      console.error("[practice-set] AI generation failed", error);
      return jsonError(
        error.retryable ? 503 : 502,
        "PRACTICE_AI_FAILED",
        error.message,
      );
    }
    throw error;
  }
}
