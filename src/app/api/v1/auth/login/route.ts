// POST /api/v1/auth/login：手机号 + 密码登录
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { toSafeUser } from "../../../../../lib/auth";
import { getCsrfCookieOptions, generateCsrfToken } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from "../../../../../lib/login-lock";
import { verifyPassword } from "../../../../../lib/password";
import {
  createSession,
  getSessionCookieOptions,
} from "../../../../../lib/session";

// 登录是会话建立入口，豁免 Origin/CSRF 校验
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const phone =
    typeof body?.phone === "string" ? body.phone.trim() : "";
  const password =
    typeof body?.password === "string" ? body.password : "";

  if (!phone || !password) {
    return jsonError(400, "INVALID_INPUT", "手机号和密码不能为空");
  }

  const ip = getClientIp(request);

  if (await isLoginLocked(prisma, phone, ip)) {
    return jsonError(429, "LOGIN_LOCKED", "登录失败次数过多，请 15 分钟后再试");
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !user.isActive || user.deletedAt || !passwordOk) {
    await recordLoginFailure(prisma, phone, ip);
    return jsonError(401, "INVALID_CREDENTIALS", "手机号或密码错误");
  }

  await clearLoginFailures(prisma, phone, ip);

  const { token, expiresAt } = await createSession(prisma, user.id);
  const csrfToken = generateCsrfToken();
  const response = NextResponse.json({
    success: true,
    data: { user: toSafeUser(user) },
  });
  response.cookies.set({
    ...getSessionCookieOptions(expiresAt),
    value: token,
  });
  response.cookies.set(getCsrfCookieOptions(csrfToken));
  return response;
}
