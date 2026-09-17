import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma, resetAuthTables } from "../../../../lib/test-db";
import { POST as changePassword } from "./change-password/route";
import { POST as consent } from "./consent/route";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";

// 认证 API 集成测试：通过真实路由处理器验证登录、会话、改密、注销与隐私同意
describe("认证 API（/api/v1/auth）", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await resetAuthTables(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** 创建演示用户（默认家庭角色，首次登录需改密） */
  async function createUser(
    overrides: Partial<{
      phone: string;
      passwordHash: string;
      role: "ADMIN" | "TEACHER" | "FAMILY";
      name: string;
      isActive: boolean;
      deletedAt: Date | null;
      mustChangePassword: boolean;
    }> = {},
  ) {
    return prisma.user.create({
      data: {
        phone: "13800000003",
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "演示家长",
        ...overrides,
      },
    });
  }

  function jsonRequest(
    url: string,
    method: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest(`${baseUrl}${url}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function doLogin(
    phone = "13800000003",
    password = "Temp@123456",
    ip = "203.0.113.7",
  ) {
    return login(
      jsonRequest("/api/v1/auth/login", "POST", { phone, password }, {
        "x-forwarded-for": ip,
      }),
    );
  }

  function authedRequest(
    url: string,
    method: string,
    sessionToken: string,
    csrfToken: string,
    body?: unknown,
  ): NextRequest {
    return jsonRequest(url, method, body, {
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
      "x-csrf-token": csrfToken,
      origin: baseUrl,
    });
  }

  it("登录成功返回用户信息并下发会话与 CSRF Cookie", async () => {
    await createUser();

    const res = await doLogin();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({
      role: "FAMILY",
      name: "演示家长",
      phoneMasked: "138****0003",
      mustChangePassword: true,
    });
    expect(res.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
    expect(res.cookies.get(CSRF_COOKIE_NAME)?.value).toBeTruthy();
  });

  it("密码错误返回 401，连续失败 5 次后锁定返回 429", async () => {
    await createUser();

    for (let i = 0; i < 5; i += 1) {
      const res = await doLogin("13800000003", "Wrong@123456");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
    }

    // 第 6 次即使密码正确也被锁定
    const locked = await doLogin();
    const lockedBody = await locked.json();
    expect(locked.status).toBe(429);
    expect(lockedBody.error.code).toBe("LOGIN_LOCKED");
  });

  it("未激活或已删除用户拒绝登录", async () => {
    await createUser({ phone: "13800000001", isActive: false });
    await createUser({ phone: "13800000002", deletedAt: new Date() });

    const inactive = await doLogin("13800000001");
    const deleted = await doLogin("13800000002");

    expect(inactive.status).toBe(401);
    expect(deleted.status).toBe(401);
  });

  it("GET /me 未登录返回 401，登录后返回当前用户", async () => {
    const unauthorized = await me(
      jsonRequest("/api/v1/auth/me", "GET"),
    );
    expect(unauthorized.status).toBe(401);

    await createUser();
    const loginRes = await doLogin();
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;
    const csrfToken = loginRes.cookies.get(CSRF_COOKIE_NAME)!.value;

    const meRes = await me(
      authedRequest("/api/v1/auth/me", "GET", sessionToken, csrfToken),
    );
    const meBody = await meRes.json();

    expect(meRes.status).toBe(200);
    expect(meBody.data.user.mustChangePassword).toBe(true);
    expect(meBody.data.user.name).toBe("演示家长");
  });

  it("修改密码后旧密码失效、mustChangePassword 置为 false，并写入审计日志", async () => {
    await createUser();
    const loginRes = await doLogin();
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;
    const csrfToken = loginRes.cookies.get(CSRF_COOKIE_NAME)!.value;

    const wrongOld = await changePassword(
      authedRequest("/api/v1/auth/change-password", "POST", sessionToken, csrfToken, {
        oldPassword: "Wrong@123456",
        newPassword: "NewPass@123",
      }),
    );
    expect(wrongOld.status).toBe(400);

    const shortNew = await changePassword(
      authedRequest("/api/v1/auth/change-password", "POST", sessionToken, csrfToken, {
        oldPassword: "Temp@123456",
        newPassword: "123",
      }),
    );
    expect(shortNew.status).toBe(400);

    const changed = await changePassword(
      authedRequest("/api/v1/auth/change-password", "POST", sessionToken, csrfToken, {
        oldPassword: "Temp@123456",
        newPassword: "NewPass@123",
      }),
    );
    expect(changed.status).toBe(200);

    const meRes = await me(
      authedRequest("/api/v1/auth/me", "GET", sessionToken, csrfToken),
    );
    const meBody = await meRes.json();
    expect(meBody.data.user.mustChangePassword).toBe(false);

    const oldLogin = await doLogin("13800000003", "Temp@123456");
    expect(oldLogin.status).toBe(401);
    const newLogin = await doLogin("13800000003", "NewPass@123");
    expect(newLogin.status).toBe(200);

    const auditCount = await prisma.auditLog.count({
      where: { action: "CHANGE_PASSWORD" },
    });
    expect(auditCount).toBe(1);
  });

  it("注销后会话失效，再次访问 /me 返回 401", async () => {
    await createUser();
    const loginRes = await doLogin();
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;
    const csrfToken = loginRes.cookies.get(CSRF_COOKIE_NAME)!.value;

    const logoutRes = await logout(
      authedRequest("/api/v1/auth/logout", "POST", sessionToken, csrfToken),
    );
    expect(logoutRes.status).toBe(200);

    const meRes = await me(
      authedRequest("/api/v1/auth/me", "GET", sessionToken, csrfToken),
    );
    expect(meRes.status).toBe(401);
  });

  it("隐私同意记录版本、IP 与 User-Agent", async () => {
    await createUser();
    const loginRes = await doLogin();
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;
    const csrfToken = loginRes.cookies.get(CSRF_COOKIE_NAME)!.value;

    const consentRes = await consent(
      authedRequest("/api/v1/auth/consent", "POST", sessionToken, csrfToken, {
        version: "v1",
      }),
    );
    const body = await consentRes.json();

    expect(consentRes.status).toBe(200);
    const record = await prisma.guardianConsent.findUniqueOrThrow({
      where: { id: body.data.consent.id },
    });
    expect(record.version).toBe("v1");
    expect(record.ip).toBe("203.0.113.7");
  });

  it("未登录访问隐私同意返回 401", async () => {
    const res = await consent(
      jsonRequest("/api/v1/auth/consent", "POST", { version: "v1" }),
    );
    expect(res.status).toBe(401);
  });

  it("状态变更接口拒绝跨域 Origin 与缺失的 CSRF 令牌", async () => {
    await createUser();
    const loginRes = await doLogin();
    const sessionToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;
    const csrfToken = loginRes.cookies.get(CSRF_COOKIE_NAME)!.value;
    const body = { oldPassword: "Temp@123456", newPassword: "NewPass@123" };

    const crossOrigin = await changePassword(
      jsonRequest("/api/v1/auth/change-password", "POST", body, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "x-csrf-token": csrfToken,
        origin: "http://evil.example.com",
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const missingToken = await changePassword(
      jsonRequest("/api/v1/auth/change-password", "POST", body, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        origin: baseUrl,
      }),
    );
    expect(missingToken.status).toBe(403);
  });

  it("登录接口豁免 Origin/CSRF 校验", async () => {
    await createUser();

    // 无 Origin、无 CSRF 头仍可正常登录
    const res = await login(
      jsonRequest("/api/v1/auth/login", "POST", {
        phone: "13800000003",
        password: "Temp@123456",
      }),
    );

    expect(res.status).toBe(200);
  });
});
