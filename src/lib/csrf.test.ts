import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  CSRF_COOKIE_NAME,
  assertStateChangeAllowed,
  generateCsrfToken,
  getCsrfCookieOptions,
} from "./csrf";

// Origin 同源校验与双提交 Cookie CSRF 校验的单元测试
describe("状态变更防护（Origin + CSRF）", () => {
  afterEach(() => vi.unstubAllEnvs());
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

  it("反向代理的内部地址与公开域名不同时允许配置的公开来源", () => {
    vi.stubEnv("APP_BASE_URL", "https://academy.huangguanedu.cn");
    expect(assertStateChangeAllowed(buildRequest({
      origin: "https://academy.huangguanedu.cn",
      csrfCookie: "token-abc", csrfHeader: "token-abc",
    }))).toBeNull();
  });

  it("公开来源的 Referer 回退仍需匹配 CSRF 令牌", () => {
    vi.stubEnv("APP_BASE_URL", "https://academy.huangguanedu.cn");
    expect(assertStateChangeAllowed(buildRequest({
      referer: "https://academy.huangguanedu.cn/practice",
      csrfCookie: "token-abc", csrfHeader: "token-abc",
    }))).toBeNull();
    expect(assertStateChangeAllowed(buildRequest({
      origin: "https://academy.huangguanedu.cn",
      csrfCookie: "token-abc", csrfHeader: null,
    }))?.status).toBe(403);
  });

  it("伪造转发头不能绕过配置的公开来源", () => {
    vi.stubEnv("APP_BASE_URL", "https://academy.huangguanedu.cn");
    const request = buildRequest({
      origin: "https://evil.example.com",
      csrfCookie: "token-abc", csrfHeader: "token-abc",
    });
    request.headers.set("x-forwarded-proto", "https");
    request.headers.set("x-forwarded-host", "evil.example.com");
    expect(assertStateChangeAllowed(request)?.status).toBe(403);
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
