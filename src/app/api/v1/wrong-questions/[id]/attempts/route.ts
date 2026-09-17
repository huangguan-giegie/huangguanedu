// POST /api/v1/wrong-questions/:id/attempts：记录再次作答结果
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";

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
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  const result = body?.result;
  if (!answer) {
    return jsonError(400, "INVALID_INPUT", "答案不能为空");
  }
  if (result !== "CORRECT" && result !== "INCORRECT" && result !== "PARTIAL") {
    return jsonError(400, "INVALID_INPUT", "result 必须是 CORRECT/INCORRECT/PARTIAL");
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  const wrongQuestion = await prisma.wrongQuestion.findUnique({
    where: { id },
  });
  if (!wrongQuestion || wrongQuestion.deletedAt) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }
  if (wrongQuestion.studentId !== familyAccount?.student?.id) {
    return jsonError(403, "FORBIDDEN", "只能操作自己的错题");
  }

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.studentAnswerAttempt.create({
      data: { wrongQuestionId: id, answer, result },
    });
    // 答错则记录一次再出错
    if (result !== "CORRECT") {
      await tx.wrongQuestionOccurrence.create({
        data: { wrongQuestionId: id },
      });
      await tx.wrongQuestion.update({
        where: { id },
        data: { mastered: false, lastReviewedAt: new Date() },
      });
    } else {
      await tx.wrongQuestion.update({
        where: { id },
        data: { mastered: true, lastReviewedAt: new Date() },
      });
    }
    return created;
  });

  return NextResponse.json({ success: true, data: { attempt } });
}
