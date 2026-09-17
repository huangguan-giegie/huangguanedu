import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client";
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from "./login-lock";
import { createTestPrisma, resetAuthTables } from "./test-db";

// 登录失败锁定的单元测试（基于 SystemSetting 持久化计数）
describe("登录失败锁定", () => {
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

  it("15 分钟内同一手机号累计 5 次失败后锁定", async () => {
    const now = new Date("2026-08-05T10:00:00.000Z");

    for (let i = 0; i < 5; i += 1) {
      await recordLoginFailure(prisma, "13800000001", "1.2.3.4", now);
    }

    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", now),
    ).resolves.toBe(true);
  });

  it("锁定持续 15 分钟，到期后自动解锁", async () => {
    const firstFailure = new Date("2026-08-05T10:00:00.000Z");
    const lastFailure = new Date("2026-08-05T10:14:00.000Z");
    const afterLockEnds = new Date("2026-08-05T10:30:00.000Z");

    for (let i = 0; i < 4; i += 1) {
      await recordLoginFailure(prisma, "13800000001", "1.2.3.4", firstFailure);
    }
    await recordLoginFailure(prisma, "13800000001", "1.2.3.4", lastFailure);

    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", lastFailure),
    ).resolves.toBe(true);
    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", afterLockEnds),
    ).resolves.toBe(false);
  });

  it("超过 15 分钟的旧失败记录不计入阈值", async () => {
    const old = new Date("2026-08-05T09:30:00.000Z");
    const now = new Date("2026-08-05T10:00:00.000Z");

    for (let i = 0; i < 4; i += 1) {
      await recordLoginFailure(prisma, "13800000001", "1.2.3.4", old);
    }
    await recordLoginFailure(prisma, "13800000001", "1.2.3.4", now);

    // 旧记录已过期，仅剩 1 次有效失败，不应锁定
    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", now),
    ).resolves.toBe(false);
  });

  it("手机号或 IP 任一达到阈值都会锁定", async () => {
    const now = new Date("2026-08-05T10:00:00.000Z");

    // 同一手机号来自多个 IP 累计 5 次失败
    for (let i = 0; i < 5; i += 1) {
      await recordLoginFailure(
        prisma,
        "13800000001",
        `10.0.0.${i}`,
        now,
      );
    }

    await expect(
      isLoginLocked(prisma, "13800000001", "10.0.0.9", now),
    ).resolves.toBe(true);
  });

  it("登录成功后清除失败计数", async () => {
    const now = new Date("2026-08-05T10:00:00.000Z");
    for (let i = 0; i < 4; i += 1) {
      await recordLoginFailure(prisma, "13800000001", "1.2.3.4", now);
    }

    await clearLoginFailures(prisma, "13800000001", "1.2.3.4");

    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", now),
    ).resolves.toBe(false);
    // 清除后再失败 4 次不应锁定
    for (let i = 0; i < 4; i += 1) {
      await recordLoginFailure(prisma, "13800000001", "1.2.3.4", now);
    }
    await expect(
      isLoginLocked(prisma, "13800000001", "1.2.3.4", now),
    ).resolves.toBe(false);
  });
});
