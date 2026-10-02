// POST /api/v1/admin/family-accounts：创建家长登录账号和学生资料
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import { generateRandomPassword, hashPassword } from "../../../../../lib/password";

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const studentName = typeof body?.studentName === "string" ? body.studentName.trim() : "";
  const grade = typeof body?.grade === "string" ? body.grade.trim() : "";
  const school = typeof body?.school === "string" ? body.school.trim() : "";

  if (!PHONE_PATTERN.test(phone)) {
    return jsonError(400, "INVALID_INPUT", "手机号格式不正确");
  }
  if (!studentName) {
    return jsonError(400, "INVALID_INPUT", "学生姓名不能为空");
  }
  if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
    return jsonError(409, "PHONE_EXISTS", "该手机号已被使用");
  }

  const tempPassword = generateRandomPassword();
  const passwordHash = await hashPassword(tempPassword);
  const account = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone,
        passwordHash,
        role: "FAMILY",
        name: studentName,
        mustChangePassword: true,
      },
    });
    const familyAccount = await tx.familyAccount.create({ data: { userId: user.id } });
    const student = await tx.student.create({
      data: { familyAccountId: familyAccount.id, name: studentName, grade, school },
    });
    return { familyAccount, student, user };
  });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "CREATE_FAMILY_ACCOUNT",
    targetType: "Student",
    targetId: account.student.id,
    summary: `管理员创建家庭账户：${studentName}（${phone}）`,
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: {
      account: {
        id: account.familyAccount.id,
        userId: account.user.id,
        phone: account.user.phone,
        studentId: account.student.id,
        studentName: account.student.name,
        grade: account.student.grade,
        school: account.student.school,
      },
      tempPassword,
    },
  });
}
