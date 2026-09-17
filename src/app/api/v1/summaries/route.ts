// GET /api/v1/summaries：学习总结列表（周报/月报/学期总结）
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

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const where: Prisma.LearningSummaryWhereInput = {};
  if (studentIds) {
    where.studentId = { in: studentIds };
  }
  if (type === "WEEKLY" || type === "MONTHLY" || type === "SEMESTER") {
    where.type = type;
  }
  if (auth.user.role === "FAMILY") {
    where.status = "PUBLISHED";
  }

  const summaries = await prisma.learningSummary.findMany({
    where,
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    include: { student: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      items: summaries.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: s.student.name,
        type: s.type,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        status: s.status,
        stats: s.stats,
        aiSuggestions: s.aiSuggestions,
        aiError: s.aiError,
        isAiGenerated: s.isAiGenerated,
        isTeacherReviewed: s.isTeacherReviewed,
        reviewedAt: s.reviewedAt,
        publishedAt: s.publishedAt,
        updatedAt: s.updatedAt,
      })),
    },
  });
}
