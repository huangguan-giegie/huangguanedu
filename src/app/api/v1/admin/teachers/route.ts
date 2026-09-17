// 管理员老师管理：列表与创建
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import { generateRandomPassword, hashPassword } from "../../../../../lib/password";

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const teachers = await prisma.teacherProfile.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: {
      teachers: teachers.map((t) => ({
        id: t.id,
        userId: t.userId,
        phone: t.user.phone,
        name: t.user.name,
        isActive: t.user.isActive,
        university: t.university,
        major: t.major,
        degree: t.degree,
        createdAt: t.createdAt,
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
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const university =
    typeof body?.university === "string" ? body.university.trim() : null;
  const major = typeof body?.major === "string" ? body.major.trim() : null;
  const degree = typeof body?.degree === "string" ? body.degree.trim() : null;

  if (!PHONE_PATTERN.test(phone) || !name) {
    return jsonError(400, "INVALID_INPUT", "手机号格式不正确或姓名为空");
  }

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) {
    return jsonError(409, "PHONE_EXISTS", "该手机号已被使用");
  }

  const tempPassword = generateRandomPassword();
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: await hashPassword(tempPassword),
      role: "TEACHER",
      name,
      mustChangePassword: true,
    },
  });

  const teacher = await prisma.teacherProfile.create({
    data: {
      userId: user.id,
      university,
      major,
      degree,
    },
  });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "CREATE_TEACHER",
    targetType: "TeacherProfile",
    targetId: teacher.id,
    summary: `管理员创建老师账号：${name}（${phone}）`,
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: {
      teacher: {
        id: teacher.id,
        userId: user.id,
        phone: user.phone,
        name: user.name,
        university: teacher.university,
        major: teacher.major,
        degree: teacher.degree,
      },
      // 临时密码只在此次响应返回一次
      tempPassword,
    },
  });
}
