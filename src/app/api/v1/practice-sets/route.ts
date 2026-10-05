// GET /api/v1/practice-sets：练习/模拟题组（独立模块）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import type { Prisma } from "../../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  let studentIds: string[] | undefined;
  if (auth.user.role === "FAMILY") {
    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: auth.user.id },
      include: { student: true },
    });
    if (!familyAccount?.student) {
      return NextResponse.json({ success: true, data: { items: [] } });
    }
    studentIds = [familyAccount.student.id];
  } else if (auth.user.role === "TEACHER") {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    studentIds = (teacherProfile?.assignments ?? []).map((a) => a.studentId);
  }

  const where: Prisma.PracticeSetWhereInput = {};
  if (studentIds) {
    where.studentId = { in: studentIds };
  }

  const sets = await prisma.practiceSet.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      student: true,
      questions: {
        include: {
          attempts: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      items: sets.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: s.student.name,
        title: s.title,
        summaryId: s.summaryId,
        mode: s.mode,
        questions: s.questions.map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer,
          explanation: question.explanation,
          difficulty: question.difficulty,
          knowledgePoints: question.knowledgePoints,
          lastAttempt: question.attempts[0] ?? null,
        })),
        createdAt: s.createdAt,
      })),
    },
  });
}
