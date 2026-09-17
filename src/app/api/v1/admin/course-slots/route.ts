// 管理员课程时段：列表与创建
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import {
  assertNoTeacherConflict,
  CourseSlotError,
  normalizeSlotInput,
} from "../../../../../lib/course-slot";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const subject = searchParams.get("subject");
  const date = searchParams.get("date");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20),
  );

  const where: Record<string, unknown> = {};
  if (type === "SMALL_CLASS" || type === "ONE_ON_ONE") {
    where.type = type;
  }
  if (subject === "MATH" || subject === "ENGLISH") {
    where.subject = subject;
  }
  if (date) {
    const day = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(day.getTime())) {
      where.date = {
        gte: day,
        lt: new Date(day.getTime() + 24 * 60 * 60 * 1000),
      };
    }
  }

  const [total, slots] = await Promise.all([
    prisma.courseSlot.count({ where }),
    prisma.courseSlot.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { teacher: { include: { user: true } } },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      total,
      page,
      pageSize,
      slots: slots.map((s) => ({
        id: s.id,
        type: s.type,
        grade: s.grade,
        subject: s.subject,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        capacity: s.capacity,
        status: s.status,
        teacherName: s.teacher.user.name,
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: body?.teacherId },
  });
  if (!teacher) {
    return jsonError(404, "TEACHER_NOT_FOUND", "老师不存在");
  }

  try {
    const input = normalizeSlotInput({
      type: body?.type,
      grade: body?.grade,
      subject: body?.subject,
      teacherId: body?.teacherId,
      date: new Date(body?.date),
      startTime: new Date(body?.startTime),
      endTime: new Date(body?.endTime),
      location: body?.location ?? "712 社区",
      capacity: body?.capacity === undefined ? undefined : Number(body?.capacity),
    });
    await assertNoTeacherConflict(
      prisma,
      input.teacherId,
      input.startTime,
      input.endTime,
    );

    const slot = await prisma.courseSlot.create({
      data: {
        type: input.type,
        grade: input.grade,
        subject: input.subject,
        teacherId: input.teacherId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location ?? "712 社区",
        capacity: input.capacity ?? 1,
      },
    });

    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "CREATE_COURSE_SLOT",
      targetType: "CourseSlot",
      targetId: slot.id,
      summary: `管理员创建课程时段：${input.type} ${input.subject} ${input.startTime.toISOString()}`,
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
