// POST /api/v1/wrong-questions/:id/feedback：学生确认识别准确或需要老师审核
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";
import {
  studentFeedbackTx,
  WrongQuestionError,
} from "../../../../../../lib/wrong-question";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const feedback = body?.feedback;
  if (feedback !== "ACCURATE" && feedback !== "NEEDS_REVIEW") {
    return jsonError(400, "INVALID_INPUT", "feedback 必须是 ACCURATE 或 NEEDS_REVIEW");
  }

  // 只能操作自己学生的错题
  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!familyAccount?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  }
  const wrongQuestion = await prisma.wrongQuestion.findUnique({
    where: { id },
  });
  if (!wrongQuestion) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }
  if (wrongQuestion.studentId !== familyAccount.student.id) {
    return jsonError(403, "FORBIDDEN", "只能操作自己的错题");
  }

  try {
    await studentFeedbackTx(prisma, id, feedback);
    return NextResponse.json({
      success: true,
      data: { wrongQuestionId: id, status: feedback === "ACCURATE" ? "PUBLISHED" : "NEEDS_REVIEW" },
    });
  } catch (error) {
    if (error instanceof WrongQuestionError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
