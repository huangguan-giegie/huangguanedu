// 管理员重置老师/家庭密码：随机临时密码 + 撤销全部 Session + 强制改密
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../../lib/csrf";
import { prisma } from "../../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../../lib/http";
import { generateRandomPassword, hashPassword } from "../../../../../../../lib/password";
import { revokeAllUserSessions } from "../../../../../../../lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return jsonError(404, "USER_NOT_FOUND", "用户不存在");
  }
  if (user.role === "ADMIN") {
    return jsonError(400, "INVALID_OPERATION", "不能重置管理员自己的密码");
  }

  const tempPassword = generateRandomPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });
  const revoked = await revokeAllUserSessions(prisma, user.id);

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "RESET_PASSWORD",
    targetType: "User",
    targetId: user.id,
    summary: `管理员重置了用户 ${user.name} 的密码，撤销 ${revoked} 个会话`,
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: {
      userId: user.id,
      name: user.name,
      // 临时密码只在此次响应返回一次
      tempPassword,
      revokedSessions: revoked,
    },
  });
}
