// POST /api/v1/auth/logout：注销当前会话并清除 Cookie
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { assertStateChangeAllowed, CSRF_COOKIE_NAME } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import {
  SESSION_COOKIE_NAME,
  deleteSessionByToken,
  getSessionCookieOptions,
} from "../../../../../lib/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    // 未登录时直接返回成功，便于前端幂等清理本地状态
    return NextResponse.json({ success: true, data: null });
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }
  await deleteSessionByToken(prisma, token);

  const response = NextResponse.json({ success: true, data: null });
  // 清除会话与 CSRF Cookie
  response.cookies.set({
    ...getSessionCookieOptions(new Date()),
    value: "",
    maxAge: 0,
  });
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: "",
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return response;
}
