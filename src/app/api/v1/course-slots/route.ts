// GET /api/v1/course-slots：家庭端查看可预约的一对一时段（小班不开放在线预约）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const date = searchParams.get("date");

  const where: Record<string, unknown> = {
    type: "ONE_ON_ONE",
    status: "OPEN",
    startTime: { gt: new Date() },
  };
  if (subject === "MATH" || subject === "ENGLISH") {
    where.subject = subject;
  }
  if (date) {
    const day = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(day.getTime())) {
      const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      where.date = { gte: day, lt: next };
    }
  }

  const slots = await prisma.courseSlot.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: { teacher: { include: { user: true } } },
  });

  return NextResponse.json({
    success: true,
    data: {
      // 月卡权益说明（小班不进入在线预约）
      smallClassNote: "月卡包含周一至周四线下小班课，请线下安排",
      slots: slots.map((s) => ({
        id: s.id,
        subject: s.subject,
        grade: s.grade,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        teacherName: s.teacher.user.name,
      })),
    },
  });
}
