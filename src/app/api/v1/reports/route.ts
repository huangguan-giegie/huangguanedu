// GET /api/v1/reports：旧月报兼容别名，映射到 type=MONTHLY 的学习总结
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import type { Prisma } from "../../../../generated/prisma/client";

/** 兼容旧字段 month：按本地时区推导 YYYY-MM，避免 UTC 截断跨月。 */
function localMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

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

  const where: Prisma.LearningSummaryWhereInput = {
    type: "MONTHLY",
  };
  if (studentIds) {
    where.studentId = { in: studentIds };
  }
  if (auth.user.role === "FAMILY") {
    where.status = "PUBLISHED";
  }

  const reports = await prisma.learningSummary.findMany({
    where,
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    include: { student: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      items: reports.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: r.student.name,
        // 兼容旧字段：由周期起点按本地时区推导 YYYY-MM
        month: localMonth(r.periodStart),
        type: r.type,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        stats: r.stats,
        aiSuggestions: r.aiSuggestions,
        isAiGenerated: r.isAiGenerated,
        isTeacherReviewed: r.isTeacherReviewed,
        reviewedAt: r.reviewedAt,
        publishedAt: r.publishedAt,
      })),
    },
  });
}
