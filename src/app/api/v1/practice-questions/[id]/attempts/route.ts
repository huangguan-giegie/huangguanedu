import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";
import { applyMasteryReview, asStringArray } from "../../../../../../lib/mastery";
import {
  gradePracticeAnswer,
  PracticeGradingError,
} from "../../../../../../lib/practice-grading";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer || answer.length > 4000) {
    return jsonError(400, "INVALID_INPUT", "答案不能为空且不能超过 4000 字符");
  }

  const family = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!family?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前家庭账号未绑定学生");
  }

  const question = await prisma.practiceQuestion.findUnique({
    where: { id },
    include: { practiceSet: true },
  });
  if (!question) {
    return jsonError(404, "PRACTICE_QUESTION_NOT_FOUND", "练习题不存在");
  }
  if (question.practiceSet.studentId !== family.student.id) {
    return jsonError(403, "FORBIDDEN", "只能提交自己的练习题");
  }

  try {
    const grade = await gradePracticeAnswer({
      question: question.question,
      expectedAnswer: question.answer,
      explanation: question.explanation,
      submittedAnswer: answer,
    });
    const knowledgePoints = asStringArray(question.knowledgePoints);

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.practiceAttempt.create({
        data: {
          practiceQuestionId: question.id,
          studentId: family.student!.id,
          answer,
          result: grade.result,
          score: grade.score,
          feedback: grade.feedback,
          gradingMethod: grade.method,
        },
      });
      const mastery = await applyMasteryReview(tx, {
        studentId: family.student!.id,
        subject: "MATH",
        knowledgePoints,
        outcome: grade.result,
      });
      return { attempt, mastery };
    });

    return NextResponse.json({
      success: true,
      data: {
        attempt: {
          id: result.attempt.id,
          answer: result.attempt.answer,
          result: result.attempt.result,
          score: result.attempt.score,
          feedback: result.attempt.feedback,
          gradingMethod: result.attempt.gradingMethod,
          attemptedAt: result.attempt.attemptedAt,
        },
        mastery: result.mastery.map((item) => ({
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
