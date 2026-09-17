import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  CSRF_COOKIE_NAME,
  assertStateChangeAllowed,
  generateCsrfToken,
  getCsrfCookieOptions,
} from "./csrf";

// Origin 同源校验与双提交 Cookie CSRF 校验的单元测试
describe("状态变更防护（Origin + CSRF）", () => {
  function buildRequest(overrides: {
    origin?: string | null;
    referer?: string | null;
    csrfCookie?: string | null;
    csrfHeader?: string | null;
  }): NextRequest {
    const headers: Record<string, string> = {};
    if (overrides.origin !== null && overrides.origin !== undefined) {
      headers.origin = overrides.origin;
    }
    if (overrides.referer !== null && overrides.referer !== undefined) {
      headers.referer = overrides.referer;
    }
    if (overrides.csrfCookie) {
      headers.cookie = `${CSRF_COOKIE_NAME}=${overrides.csrfCookie}`;
    }
    if (overrides.csrfHeader) {
      headers["x-csrf-token"] = overrides.csrfHeader;
    }
    return new NextRequest(
      "http://localhost:3000/api/v1/auth/logout",
      { method: "POST", headers },
    );
  }

  it("同源 Origin 且 CSRF 令牌匹配时放行", () => {
    const result = assertStateChangeAllowed(
      buildRequest({
        origin: "http://localhost:3000",
        csrfCookie: "token-abc",
        csrfHeader: "token-abc",
      }),
    );

    expect(result).toBeNull();
  });

  it("跨域 Origin 被拒绝", () => {
    const result = assertStateChangeAllowed(
      buildRequest({
        origin: "http://evil.example.com",
        csrfCookie: "token-abc",
        csrfHeader: "token-abc",
      }),
    );

    expect(result?.status).toBe(403);
  });

  it("缺少 Origin 与 Referer 时拒绝", () => {
    const result = assertStateChangeAllowed(
      buildRequest({
        origin: null,
        referer: null,
        csrfCookie: "token-abc",
        csrfHeader: "token-abc",
      }),
    );

    expect(result?.status).toBe(403);
  });

  it("无 Origin 但 Referer 同源时放行", () => {
    const result = assertStateChangeAllowed(
      buildRequest({
        origin: null,
        referer: "http://localhost:3000/login",
        csrfCookie: "token-abc",
        csrfHeader: "token-abc",
      }),
    );

    expect(result).toBeNull();
  });

  it("Referer 跨域时拒绝", () => {
    const result = assertStateChangeAllowed(
      buildRequest({
        origin: null,
        referer: "http://evil.example.com/login",
        csrfCookie: "token-abc",
        csrfHeader: "token-abc",
      }),
    );

    expect(result?.status).toBe(403);
  });

  it("CSRF 令牌缺失或不匹配时拒绝", () => {
    const missing = assertStateChangeAllowed(
      buildRequest({
        origin: "http://localhost:3000",
        csrfCookie: "token-abc",
        csrfHeader: null,
      }),
    );
    const mismatched = assertStateChangeAllowed(
      buildRequest({
        origin: "http://localhost:3000",
        csrfCookie: "token-abc",
        csrfHeader: "token-xyz",
      }),
    );

    expect(missing?.status).toBe(403);
    expect(mismatched?.status).toBe(403);
  });

  it("生成 32 字节以上的 URL 安全 CSRF 令牌", () => {
    const token = generateCsrfToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.byteLength(token)).toBeGreaterThanOrEqual(32);
  });

  it("CSRF Cookie 非 HttpOnly（供前端读取回传）、SameSite=Lax、Path=/", () => {
    const options = getCsrfCookieOptions("token-abc");

    expect(options.httpOnly).toBe(false);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.value).toBe("token-abc");
  });
});
