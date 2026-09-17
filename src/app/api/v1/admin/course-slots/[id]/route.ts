// 管理员课程时段：修改
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import {
  assertNoTeacherConflict,
  CourseSlotError,
  normalizeSlotInput,
} from "../../../../../../lib/course-slot";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const existing = await prisma.courseSlot.findUnique({
    where: { id },
    include: { bookings: true },
  });
  if (!existing) {
    return jsonError(404, "SLOT_NOT_FOUND", "课程时段不存在");
  }

  const body = await request.json().catch(() => null);
  try {
    // 有一对一已确认预约的时段不允许修改时间/老师
    const hasActiveOneOnOne = existing.bookings.some(
      (b) =>
        b.status === "CONFIRMED" ||
        b.status === "PENDING" ||
        b.status === "ABSENT",
    );
    const timeOrTeacherChanged =
      (body?.startTime !== undefined && new Date(body.startTime).getTime() !== existing.startTime.getTime()) ||
      (body?.endTime !== undefined && new Date(body.endTime).getTime() !== existing.endTime.getTime()) ||
      (body?.teacherId !== undefined && body.teacherId !== existing.teacherId);
    if (hasActiveOneOnOne && timeOrTeacherChanged) {
      throw new CourseSlotError(400, "SLOT_LOCKED", "已有确认预约的时段不能修改时间或老师");
    }

    const nextStart = body?.startTime !== undefined ? new Date(body.startTime) : existing.startTime;
    const nextEnd = body?.endTime !== undefined ? new Date(body.endTime) : existing.endTime;
    const nextTeacherId = body?.teacherId !== undefined ? body.teacherId : existing.teacherId;

    const input = normalizeSlotInput({
      type: body?.type ?? existing.type,
      grade: body?.grade ?? existing.grade,
      subject: body?.subject ?? existing.subject,
      teacherId: nextTeacherId,
      date: body?.date !== undefined ? new Date(body.date) : existing.date,
      startTime: nextStart,
      endTime: nextEnd,
      location: body?.location ?? existing.location,
      capacity: body?.capacity === undefined ? existing.capacity : Number(body.capacity),
    });
    await assertNoTeacherConflict(
      prisma,
      input.teacherId,
      input.startTime,
      input.endTime,
      id,
    );

    const slot = await prisma.courseSlot.update({
      where: { id },
      data: {
        type: input.type,
        grade: input.grade,
        subject: input.subject,
        teacherId: input.teacherId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location ?? existing.location,
        capacity: input.capacity ?? existing.capacity,
        ...(body?.status === "OPEN" || body?.status === "FULL" || body?.status === "CANCELLED"
          ? { status: body.status }
          : {}),
      },
    });

    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "UPDATE_COURSE_SLOT",
      targetType: "CourseSlot",
      targetId: slot.id,
      summary: `管理员修改课程时段 ${slot.id}`,
      ip: getClientIp(request),
    });

    return NextResponse.json({ success: true, data: { slot } });
  } catch (error) {
    if (error instanceof CourseSlotError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
