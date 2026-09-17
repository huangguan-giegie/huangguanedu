import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client";
import { writeAuditLog } from "./audit";
import { hashPassword } from "./password";
import { createTestPrisma, resetAuthTables } from "./test-db";

// 审计日志写入的单元测试
describe("审计日志", () => {
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

  it("写入带操作人的审计日志", async () => {
    const user = await prisma.user.create({
      data: {
        phone: "13800000001",
        passwordHash: await hashPassword("Temp@123456"),
        role: "ADMIN",
        name: "系统管理员",
      },
    });

    await writeAuditLog(prisma, {
      actor: { id: user.id, name: user.name },
      action: "WRONG_QUESTION_REVIEW",
      targetType: "WrongQuestion",
      targetId: "wq-1",
      summary: "老师复核了错题 wq-1",
      ip: "1.2.3.4",
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: "wq-1" },
    });

    expect(log.actorId).toBe(user.id);
    expect(log.actorName).toBe("系统管理员");
    expect(log.action).toBe("WRONG_QUESTION_REVIEW");
    expect(log.targetType).toBe("WrongQuestion");
    expect(log.summary).toContain("wq-1");
    expect(log.ip).toBe("1.2.3.4");
  });

  it("无操作人时 actorId 与 actorName 为 null", async () => {
    await writeAuditLog(prisma, {
      actor: null,
      action: "SYSTEM_CLEANUP",
      targetType: "RawQuestionImage",
      targetId: "img-1",
      summary: "系统清理了过期原图",
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: "img-1" },
    });

    expect(log.actorId).toBeNull();
    expect(log.actorName).toBeNull();
  });
});
