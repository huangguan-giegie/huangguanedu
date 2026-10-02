// 管理员老师管理：修改资料
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
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
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const university =
    typeof body?.university === "string" ? body.university.trim() : undefined;
  const major = typeof body?.major === "string" ? body.major.trim() : undefined;
  const degree = typeof body?.degree === "string" ? body.degree.trim() : undefined;

  if (name === undefined && university === undefined && major === undefined && degree === undefined) {
    return jsonError(400, "INVALID_INPUT", "至少提供一项要修改的内容");
  }

  const teacher = await prisma.teacherProfile.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!teacher) {
    return jsonError(404, "TEACHER_NOT_FOUND", "老师不存在");
  }

  const [updatedTeacher, updatedUser] = await prisma.$transaction([
    prisma.teacherProfile.update({
      where: { id },
      data: {
        ...(university !== undefined ? { university } : {}),
        ...(major !== undefined ? { major } : {}),
        ...(degree !== undefined ? { degree } : {}),
      },
    }),
    ...(name !== undefined
      ? [
          prisma.user.update({
            where: { id: teacher.userId },
            data: { name },
          }),
        ]
      : []),
  ]);

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "UPDATE_TEACHER",
    targetType: "TeacherProfile",
    targetId: teacher.id,
    summary: `管理员修改老师资料：${teacher.user.name}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: {
      teacher: {
        id: updatedTeacher.id,
        name: updatedUser?.name ?? teacher.user.name,
        university: updatedTeacher.university,
        major: updatedTeacher.major,
        degree: updatedTeacher.degree,
      },
    },
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!teacher) return jsonError(404, "TEACHER_NOT_FOUND", "老师不存在");

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: teacher.userId },
      data: { isActive: false, deletedAt: teacher.user.deletedAt ?? now },
    }),
    prisma.teacherStudentAssignment.updateMany({
      where: { teacherId: id, endsAt: null },
      data: { endsAt: now },
    }),
    prisma.session.deleteMany({ where: { userId: teacher.userId } }),
  ]);

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "DISABLE_TEACHER_ACCOUNT",
    targetType: "TeacherProfile",
    targetId: teacher.id,
    summary: `管理员停用老师账号：${teacher.user.name}（${teacher.user.phone}）`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { teacherId: teacher.id, isActive: false } });
}
