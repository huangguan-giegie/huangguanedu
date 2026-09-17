// POST /api/v1/auth/change-password：修改登录密码
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser, toSafeUser } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import { hashPassword, verifyPassword } from "../../../../../lib/password";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request, prisma);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const oldPassword =
    typeof body?.oldPassword === "string" ? body.oldPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!oldPassword || !newPassword) {
    return jsonError(400, "INVALID_INPUT", "旧密码和新密码不能为空");
  }
  if (newPassword.length < 8) {
    return jsonError(400, "WEAK_PASSWORD", "新密码至少需要 8 位");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.user.id },
  });
  const oldPasswordOk = await verifyPassword(oldPassword, user.passwordHash);
  if (!oldPasswordOk) {
    return jsonError(400, "WRONG_OLD_PASSWORD", "旧密码不正确");
  }

  const newPasswordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash, mustChangePassword: false },
  });

  // 修改密码属于安全敏感操作，写入审计日志
  await writeAuditLog(prisma, {
    actor: { id: user.id, name: user.name },
    action: "CHANGE_PASSWORD",
    targetType: "User",
    targetId: user.id,
    summary: "用户修改了自己的登录密码",
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: { user: toSafeUser({ ...user, mustChangePassword: false }) },
  });
}
