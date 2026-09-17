// 管理员预约：列表
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20),
  );

  const where: Record<string, unknown> = {};
  if (
    status === "PENDING" ||
    status === "CONFIRMED" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "ABSENT"
  ) {
    where.status = status;
  }

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        student: true,
        slot: { include: { teacher: { include: { user: true } } } },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      total,
      page,
      pageSize,
      bookings: bookings.map((b) => ({
        id: b.id,
        status: b.status,
        lockedHours: b.lockedHours,
        createdAt: b.createdAt,
        student: { id: b.student.id, name: b.student.name },
        slot: {
          id: b.slot.id,
          subject: b.slot.subject,
          startTime: b.slot.startTime,
          endTime: b.slot.endTime,
          location: b.slot.location,
          teacherName: b.slot.teacher.user.name,
        },
      })),
    },
  });
}
