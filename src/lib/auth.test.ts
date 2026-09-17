import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../generated/prisma/client";
import { requireRole, requireUser, toSafeUser } from "./auth";
import { hashPassword } from "./password";
import { SESSION_COOKIE_NAME, createSession } from "./session";
import { createTestPrisma, resetAuthTables } from "./test-db";

// 角色权限中间件与安全用户映射的单元测试
describe("认证与角色中间件", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await resetAuthTables(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(role: "ADMIN" | "TEACHER" | "FAMILY") {
    return prisma.user.create({
      data: {
        phone: `1390000000${role === "ADMIN" ? 1 : role === "TEACHER" ? 2 : 3}`,
        passwordHash: await hashPassword("Temp@123456"),
        role,
        name: `测试${role}`,
      },
    });
  }

  function buildRequest(sessionToken?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers.cookie = `${SESSION_COOKIE_NAME}=${sessionToken}`;
    }
    return new NextRequest("http://localhost:3000/api/v1/test", { headers });
  }

  it("未登录时 requireUser 返回 401", async () => {
    const result = await requireUser(buildRequest(), prisma);

    if (!("error" in result)) {
      throw new Error("期望返回错误响应");
    }
    expect(result.error.status).toBe(401);
  });

  it("有效会话返回脱敏后的用户信息", async () => {
    const user = await createUser("FAMILY");
    const { token } = await createSession(prisma, user.id);

    const result = await requireUser(buildRequest(token), prisma);

    if (!("user" in result)) {
      throw new Error("期望返回用户信息");
    }
    expect(result.user).toMatchObject({
      id: user.id,
      role: "FAMILY",
      name: "测试FAMILY",
      phoneMasked: "139****0003",
      mustChangePassword: true,
    });
  });

  it("已停用或已删除用户拒绝访问", async () => {
    const inactive = await prisma.user.create({
      data: {
        phone: "13900000004",
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "停用用户",
        isActive: false,
      },
    });
    const deleted = await prisma.user.create({
      data: {
        phone: "13900000005",
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "已删除用户",
        deletedAt: new Date(),
      },
    });
    const inactiveSession = await createSession(prisma, inactive.id);
    const deletedSession = await createSession(prisma, deleted.id);

    const inactiveResult = await requireUser(
      buildRequest(inactiveSession.token),
      prisma,
    );
    const deletedResult = await requireUser(
      buildRequest(deletedSession.token),
      prisma,
    );

    if (!("error" in inactiveResult) || !("error" in deletedResult)) {
      throw new Error("期望返回错误响应");
    }
    expect(inactiveResult.error.status).toBe(401);
    expect(deletedResult.error.status).toBe(401);
  });

  it("requireRole 角色匹配时放行，不匹配时返回 403", async () => {
    const admin = await createUser("ADMIN");
    const family = await createUser("FAMILY");
    const adminSession = await createSession(prisma, admin.id);
    const familySession = await createSession(prisma, family.id);

    const allowed = await requireRole(
      buildRequest(adminSession.token),
      prisma,
      ["ADMIN", "TEACHER"],
    );
    const denied = await requireRole(
      buildRequest(familySession.token),
      prisma,
      ["ADMIN", "TEACHER"],
    );

    if (!("user" in allowed)) {
      throw new Error("期望返回用户信息");
    }
    if (!("error" in denied)) {
      throw new Error("期望返回错误响应");
    }
    expect(denied.error.status).toBe(403);
  });

  it("安全用户信息不暴露 passwordHash", () => {
    const user = {
      id: "u1",
      phone: "13800000001",
      passwordHash: "secret",
      role: "ADMIN" as const,
      name: "管理员",
      mustChangePassword: true,
    };

    const safe = toSafeUser(user);

    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe.phoneMasked).toBe("138****0001");
  });
});
