// POST /api/v1/wrong-questions/:id/attempts：记录再次作答结果
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";
import { applyMasteryReview } from "../../../../../../lib/mastery";
import { gradePracticeAnswer, PracticeGradingError } from "../../../../../../lib/practice-grading";

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
  const legacyResult = body?.result;
  if (!answer) {
    return jsonError(400, "INVALID_INPUT", "答案不能为空");
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  const wrongQuestion = await prisma.wrongQuestion.findUnique({
    where: { id },
    include: { knowledgePointRecords: true },
  });
  if (!wrongQuestion || wrongQuestion.deletedAt) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }
  if (wrongQuestion.studentId !== familyAccount?.student?.id) {
    return jsonError(403, "FORBIDDEN", "只能操作自己的错题");
  }

  try {
    const grade = wrongQuestion.finalAnswer
      ? await gradePracticeAnswer({
          question: wrongQuestion.recognizedQuestion ?? "错题复习",
          expectedAnswer: wrongQuestion.finalAnswer,
          submittedAnswer: answer,
          explanation: Array.isArray(wrongQuestion.correctSteps)
            ? wrongQuestion.correctSteps.join("\n")
            : null,
        })
      : legacyResult === "CORRECT" || legacyResult === "PARTIAL" || legacyResult === "INCORRECT"
        ? {
            result: legacyResult,
            score: legacyResult === "CORRECT" ? 100 : legacyResult === "PARTIAL" ? 60 : 0,
            feedback: "该旧题缺少标准答案，沿用原有自评结果。",
            method: "DETERMINISTIC" as const,
          }
        : null;
    if (!grade) {
      return jsonError(409, "ANSWER_NOT_GRADEABLE", "该错题缺少标准答案，暂时无法自动判题");
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const created = await tx.studentAnswerAttempt.create({
        data: { wrongQuestionId: id, answer, result: grade.result },
      });
      if (grade.result !== "CORRECT") {
        await tx.wrongQuestionOccurrence.create({ data: { wrongQuestionId: id } });
      }
      await tx.wrongQuestion.update({
        where: { id },
        data: {
          mastered: grade.result === "CORRECT",
          lastReviewedAt: new Date(),
        },
      });
      const mastery = await applyMasteryReview(tx, {
        studentId: wrongQuestion.studentId,
        subject: wrongQuestion.subject,
        knowledgePoints: wrongQuestion.knowledgePointRecords.map((item) => item.knowledgePoint),
        outcome: grade.result,
      });
      return { created, mastery };
    });

    return NextResponse.json({
      success: true,
      data: {
        attempt: transactionResult.created,
        grading: grade,
        mastery: transactionResult.mastery.map((item) => ({
          knowledgePoint: item.knowledgePoint,
          masteryScore: item.masteryScore,
          nextReviewAt: item.nextReviewAt,
        })),
      },
    });
  } catch (error) {
    if (error instanceof PracticeGradingError) {
      return jsonError(503, "GRADING_UNAVAILABLE", error.message);
    }
    throw error;
  }
}
