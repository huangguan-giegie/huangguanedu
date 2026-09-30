// POST /api/v1/practice-sets/generate：老师/管理员为学生生成数学模拟题
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
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const studentId = typeof body?.studentId === "string" ? body.studentId : "";
  const count = body?.count === undefined ? 5 : Number(body.count);
  if (!studentId || !Number.isInteger(count) || count < 3 || count > 5) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "studentId 必填，count 必须是 3 至 5 的整数",
    );
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
