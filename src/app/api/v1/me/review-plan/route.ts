import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { seedMasteryFromWrongQuestions } from "../../../../../lib/mastery";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) return auth.error;

  const family = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!family?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前家庭账号未绑定学生");
  }

  await seedMasteryFromWrongQuestions(prisma, family.student.id);
  const now = new Date();
  const items = await prisma.knowledgeMastery.findMany({
    where: { studentId: family.student.id },
    orderBy: [
      { nextReviewAt: "asc" },
      { masteryScore: "asc" },
      { knowledgePoint: "asc" },
    ],
    take: 50,
  });

  const dueCount = items.filter(
    (item) => !item.nextReviewAt || item.nextReviewAt <= now,
  ).length;
  const averageMastery = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.masteryScore, 0) / items.length)
    : 0;
  const suggestedDifficulty =
    averageMastery >= 80 ? "HARD" : averageMastery >= 55 ? "MEDIUM" : "EASY";

  return NextResponse.json({
    success: true,
    data: {
      studentId: family.student.id,
      dueCount,
      averageMastery,
      suggestedDifficulty,
      items: items.map((item) => ({
        id: item.id,
        subject: item.subject,
        knowledgePoint: item.knowledgePoint,
        masteryScore: item.masteryScore,
        stability: item.stability,
        difficulty: item.difficulty,
        reviewCount: item.reviewCount,
        lapseCount: item.lapseCount,
        lastReviewedAt: item.lastReviewedAt,
        nextReviewAt: item.nextReviewAt,
        due: !item.nextReviewAt || item.nextReviewAt <= now,
      })),
    },
  });
}
