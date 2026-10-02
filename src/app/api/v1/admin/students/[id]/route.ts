// 管理员学生管理：详情与修改
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      familyAccount: { include: { user: true } },
      teacherAssignments: {
        where: { endsAt: null },
        include: { teacher: { include: { user: true } } },
      },
      entitlements: { include: { plan: true } },
    },
  });

  if (!student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  return NextResponse.json({
    success: true,
    data: {
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        school: student.school,
        family: {
          userId: student.familyAccount.userId,
          name: student.familyAccount.user.name,
          phone: student.familyAccount.user.phone,
        },
        teachers: student.teacherAssignments.map((a) => ({
          assignmentId: a.id,
          name: a.teacher.user.name,
        })),
        entitlements: student.entitlements.map((e) => ({
          id: e.id,
          planName: e.plan.name,
          paid: e.paid,
          remainingHours: e.remainingHours,
          monthlyOneOnOneHours: e.monthlyOneOnOneHours,
        })),
      },
    },
  });
}

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
  const grade = typeof body?.grade === "string" ? body.grade.trim() : undefined;
  const school =
    typeof body?.school === "string" ? body.school.trim() : undefined;

  if (name === undefined && grade === undefined && school === undefined) {
    return jsonError(400, "INVALID_INPUT", "至少提供一项要修改的内容");
  }

  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  const student = await prisma.student.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(grade !== undefined ? { grade } : {}),
      ...(school !== undefined ? { school } : {}),
    },
  });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "UPDATE_STUDENT",
    targetType: "Student",
    targetId: student.id,
    summary: `管理员修改学生信息：${existing.name} -> ${student.name}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { student } });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: { familyAccount: { include: { user: true } } },
  });
  if (!student) return jsonError(404, "STUDENT_NOT_FOUND", "学生不存在");
  if (!student.familyAccount) return jsonError(404, "FAMILY_ACCOUNT_NOT_FOUND", "家庭账户不存在");

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: student.familyAccount.userId },
      data: { isActive: false, deletedAt: student.familyAccount.user.deletedAt ?? now },
    }),
    prisma.session.deleteMany({ where: { userId: student.familyAccount.userId } }),
  ]);

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "DISABLE_FAMILY_ACCOUNT",
    targetType: "Student",
    targetId: student.id,
    summary: `管理员停用家庭账号：${student.name}（${student.familyAccount.user.phone}）`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { studentId: student.id, isActive: false } });
}
