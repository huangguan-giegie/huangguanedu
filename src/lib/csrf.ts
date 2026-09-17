// 状态变更接口防护：同源 Origin 校验 + 双提交 Cookie 模式 CSRF 校验
// 双提交 Cookie 模式：登录时下发可被前端读取的 yy_csrf Cookie，
// 前端在状态变更请求中通过 X-CSRF-Token 头回传该值，服务端比对两者是否一致。
import { randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import { jsonError } from "./http";

// CSRF Cookie 名称（可通过环境变量覆盖）
export const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? "yy_csrf";

// 前端回传 CSRF 令牌的请求头名称
export const CSRF_HEADER_NAME = "x-csrf-token";

// CSRF 令牌字节数（32 字节随机数）
const CSRF_TOKEN_BYTES = 32;

/** 生成 URL 安全的 CSRF 令牌 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}

/**
 * CSRF Cookie 属性：非 HttpOnly（前端 JS 需读取后回传）、
 * SameSite=Lax、Path=/，仅生产环境启用 Secure。
 */
export function getCsrfCookieOptions(value: string): {
  name: string;
  value: string;
  httpOnly: false;
  secure: boolean;
  sameSite: "lax";
  path: "/";
} {
  return {
    name: CSRF_COOKIE_NAME,
    value,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

/** 校验来源与站点是否同源（Origin 缺失时回退 Referer） */
function validateSameOrigin(request: NextRequest): boolean {
  const siteOrigin = new URL(request.url).origin;

  const origin = request.headers.get("origin");
  if (origin) {
    return origin === siteOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === siteOrigin;
    } catch {
      // 非法 Referer 视同缺失
      return false;
    }
  }

  // 无 Origin 且无 Referer：非浏览器发起的状态变更，按严格策略拒绝
  return false;
}

/** 校验双提交 Cookie：X-CSRF-Token 头必须与 Cookie 值一致 */
function validateCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}

/**
 * 状态变更接口统一防护入口。
 * 校验通过返回 null；否则返回 403 错误响应。
 */
export function assertStateChangeAllowed(
  request: NextRequest,
): ReturnType<typeof jsonError> | null {
  if (!validateSameOrigin(request)) {
    return jsonError(403, "INVALID_ORIGIN", "状态变更请求必须来自本站同源页面");
  }
  if (!validateCsrfToken(request)) {
    return jsonError(403, "CSRF_TOKEN_MISMATCH", "CSRF 令牌缺失或不匹配");
  }
  return null;
}
