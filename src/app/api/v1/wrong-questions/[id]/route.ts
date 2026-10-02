// GET /api/v1/wrong-questions/:id：错题详情（三层展示：识别与思路 -> 错误原因与知识点 -> 完整解答）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const wrongQuestion = await prisma.wrongQuestion.findUnique({
    where: { id },
    include: {
      student: { include: { familyAccount: true } },
      knowledgePointRecords: true,
      answerAttempts: { orderBy: { attemptedAt: "desc" } },
      favorites: { where: { userId: auth.user.id }, select: { id: true } },
      rawImages: {
        where: { deletedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      },
    },
  });
  if (!wrongQuestion || wrongQuestion.deletedAt) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }

  // 权限：家庭看自己的；老师看负责学生；管理员全部
  if (auth.user.role === "FAMILY") {
    if (wrongQuestion.student.familyAccount.userId !== auth.user.id) {
      return jsonError(403, "FORBIDDEN", "无权访问该错题");
    }
  } else if (auth.user.role === "TEACHER") {
    const isAssigned = await prisma.teacherStudentAssignment.findFirst({
      where: {
        studentId: wrongQuestion.studentId,
        endsAt: null,
        teacher: { userId: auth.user.id },
      },
    });
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "无权访问该错题");
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      wrongQuestion: {
        id: wrongQuestion.id,
        subject: wrongQuestion.subject,
        status: wrongQuestion.status,
        // 第一层：题目识别与思路提示
        recognizedQuestion: wrongQuestion.recognizedQuestion,
        questionType: wrongQuestion.questionType,
        thinkingHint: wrongQuestion.thinkingHint,
        studentWorkDetected: wrongQuestion.studentWorkDetected,
        studentWorkTranscription: wrongQuestion.studentWorkTranscription,
        studentApproach: wrongQuestion.studentApproach,
        firstErrorStep: wrongQuestion.firstErrorStep,
        misconception: wrongQuestion.misconception,
        // 第二层：错误原因与知识点
        errorCauses: wrongQuestion.errorCauses,
        knowledgePoints: wrongQuestion.knowledgePointRecords.map(
          (k) => k.knowledgePoint,
        ),
        difficulty: wrongQuestion.difficulty,
        aiConfidence: wrongQuestion.aiConfidence,
        // 第三层：完整解答
        correctSteps: wrongQuestion.correctSteps,
        finalAnswer: wrongQuestion.finalAnswer,
        remedialPractice: wrongQuestion.remedialPractice,
        errorType: wrongQuestion.errorType,
        teacherNote: wrongQuestion.teacherNote,
        mastered: wrongQuestion.mastered,
        isAiGenerated: wrongQuestion.isAiGenerated,
        isTeacherReviewed: wrongQuestion.isTeacherReviewed,
        isFavorite: wrongQuestion.favorites.length > 0,
        imageIds: wrongQuestion.rawImages.map((image) => image.id),
        studentConfirmedAt: wrongQuestion.studentConfirmedAt,
        firstSeenAt: wrongQuestion.firstSeenAt,
        lastReviewedAt: wrongQuestion.lastReviewedAt,
        attempts: wrongQuestion.answerAttempts,
      },
    },
  });
}
