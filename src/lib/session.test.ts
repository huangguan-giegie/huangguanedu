import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "./password";
import {
  SESSION_COOKIE_NAME,
  createSession,
  deleteSessionByToken,
  findSessionUser,
  generateSessionToken,
  getSessionCookieOptions,
  hashSessionToken,
  revokeAllUserSessions,
} from "./session";
import { createTestPrisma, resetAuthTables } from "./test-db";

// 数据库 Session 与 Cookie 工具的单元测试
describe("session 会话工具", () => {
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

  /** 创建测试用户，返回用户 ID */
  async function createTestUser(phone = "13800000001"): Promise<string> {
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "测试家长",
      },
    });
    return user.id;
  }

  it("生成 32 字节以上的 URL 安全随机令牌", () => {
    const token = generateSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.byteLength(token)).toBeGreaterThanOrEqual(32);
  });

  it("相同令牌的哈希一致，且为 64 位十六进制", () => {
    const token = "test-token-abc";

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("创建会话后可通过令牌查回用户", async () => {
    const userId = await createTestUser();
    const { token } = await createSession(prisma, userId);

    const user = await findSessionUser(prisma, token);

    expect(user?.id).toBe(userId);
  });

  it("无效或缺失令牌视为未登录", async () => {
    await expect(findSessionUser(prisma, undefined)).resolves.toBeNull();
    await expect(findSessionUser(prisma, "not-exist")).resolves.toBeNull();
  });

  it("过期会话返回未登录并从数据库删除", async () => {
    const userId = await createTestUser();
    const now = new Date();
    const { token } = await createSession(prisma, userId, now);

    // 用超过 7 天的时间点模拟会话已过期
    const afterExpiry = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    vi.setSystemTime(afterExpiry);
    const user = await findSessionUser(prisma, token);
    vi.useRealTimers();

    expect(user).toBeNull();
    const count = await prisma.session.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("注销令牌后会话失效", async () => {
    const userId = await createTestUser();
    const { token } = await createSession(prisma, userId);

    await deleteSessionByToken(prisma, token);

    await expect(findSessionUser(prisma, token)).resolves.toBeNull();
  });

  it("撤销某用户全部会话，不影响其他用户", async () => {
    const userId = await createTestUser("13800000001");
    const otherUserId = await createTestUser("13800000002");
    const first = await createSession(prisma, userId);
    const second = await createSession(prisma, userId);
    const other = await createSession(prisma, otherUserId);

    const deleted = await revokeAllUserSessions(prisma, userId);

    expect(deleted).toBe(2);
    await expect(findSessionUser(prisma, first.token)).resolves.toBeNull();
    await expect(findSessionUser(prisma, second.token)).resolves.toBeNull();
    await expect(findSessionUser(prisma, other.token)).resolves.toMatchObject({
      id: otherUserId,
    });
  });

  it("Cookie 使用 HttpOnly、SameSite=Lax、Path=/ 并仅在生产环境启用 Secure", () => {
    const options = getSessionCookieOptions(new Date());

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.name).toBe(SESSION_COOKIE_NAME);
  });
});
