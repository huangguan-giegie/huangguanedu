import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "./test-db";
import { processAnalysisJobs } from "./analysis-worker";
import { runDataCleanup } from "./cleanup";

describe("异步分析 worker 与清理", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.analysisJob.deleteMany();
    await prisma.wrongQuestionKnowledgePoint.deleteMany();
    await prisma.rawQuestionImage.deleteMany();
    await prisma.wrongQuestion.deleteMany();
    await prisma.student.deleteMany();
    await prisma.familyAccount.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedStudent() {
    const user = await prisma.user.create({
      data: {
        phone: "13800000003",
        passwordHash: "scrypt:x",
        role: "FAMILY",
        name: "演示家长",
      },
    });
    const account = await prisma.familyAccount.create({
      data: { userId: user.id },
    });
    return prisma.student.create({
      data: {
        familyAccountId: account.id,
        name: "演示学生 A",
        grade: "初二",
        school: "演示中学",
      },
    });
  }

  async function seedPendingJob(studentId: string) {
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId,
        subject: "MATH",
        status: "PROCESSING",
      },
    });
    const job = await prisma.analysisJob.create({
      data: {
        wrongQuestionId: wrongQuestion.id,
        status: "PENDING",
        nextRunAt: new Date(Date.now() - 1000),
      },
    });
    return { wrongQuestion, job };
  }

  it("Mock 分析成功：填充结构化结果并进入待学生确认", async () => {
    const student = await seedStudent();
    const { wrongQuestion, job } = await seedPendingJob(student.id);

    const processed = await processAnalysisJobs(prisma);
    expect(processed).toBe(1);

    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("PENDING_STUDENT_CONFIRMATION");
    expect(updated.isAiGenerated).toBe(true);
    expect(updated.recognizedQuestion).toContain("2x + 3 = 11");
    expect(updated.finalAnswer).toBe("x = 4");
    expect(updated.aiConfidence).toBe(0.95);

    const jobAfter = await prisma.analysisJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(jobAfter.status).toBe("COMPLETED");
    expect(jobAfter.completedAt).not.toBeNull();

    const points = await prisma.wrongQuestionKnowledgePoint.findMany({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(points.map((p) => p.knowledgePoint)).toContain("一元一次方程");
  });

  it("过期原图清理：删除文件记录并标记 EXPIRED", async () => {
    const student = await seedStudent();
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: { studentId: student.id, subject: "MATH", status: "PUBLISHED" },
    });
    await prisma.rawQuestionImage.create({
      data: {
        studentId: student.id,
        wrongQuestionId: wrongQuestion.id,
        filePath: "questions/nonexistent.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await runDataCleanup(prisma);
    expect(result.deletedImages).toBe(1);
    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.deletedAt).not.toBeNull();
    expect(image.reviewStatus).toBe("EXPIRED");
  });

  it("待学生确认的过期原图不会被清理（等待 7 天自动转复核）", async () => {
    const student = await seedStudent();
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "PENDING_STUDENT_CONFIRMATION",
      },
    });
    await prisma.rawQuestionImage.create({
      data: {
        studentId: student.id,
        wrongQuestionId: wrongQuestion.id,
        filePath: "questions/keep.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await runDataCleanup(prisma);
    expect(result.deletedImages).toBe(0);
    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.deletedAt).toBeNull();
  });

  it("待确认超过 7 天：自动转老师复核并延长原图保留 7 天", async () => {
    const student = await seedStudent();
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "PENDING_STUDENT_CONFIRMATION",
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.rawQuestionImage.create({
      data: {
        studentId: student.id,
        wrongQuestionId: wrongQuestion.id,
        filePath: "questions/auto.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await runDataCleanup(prisma);
    expect(result.autoReviewed).toBe(1);
    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("NEEDS_REVIEW");
    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.reviewStatus).toBe("AWAITING_REVIEW");
    expect(image.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 3600000,
    );
  });

  it("任务失败进入老师复核：原图保留 7 天并标记 AWAITING_REVIEW", async () => {
    const student = await seedStudent();
    const { wrongQuestion, job } = await seedPendingJob(student.id);
    await prisma.rawQuestionImage.create({
      data: {
        studentId: student.id,
        wrongQuestionId: wrongQuestion.id,
        filePath: "questions/fail.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        expiresAt: new Date(Date.now() + 24 * 3600000),
      },
    });
    // 已有 2 次尝试，本次再失败即超过最大重试次数（2）
    await prisma.analysisJob.update({
      where: { id: job.id },
      data: { attempts: 2 },
    });

    const oldMode = process.env.QWEN_MODE;
    const oldKey = process.env.DASHSCOPE_API_KEY;
    const oldBase = process.env.DASHSCOPE_BASE_URL;
    const oldFetch = globalThis.fetch;
    try {
      process.env.QWEN_MODE = "live";
      process.env.DASHSCOPE_API_KEY = "sk-test";
      process.env.DASHSCOPE_BASE_URL =
        "https://dashscope.aliyuncs.com/compatible-mode/v1";
      globalThis.fetch = (async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      await processAnalysisJobs(prisma);
    } finally {
      process.env.QWEN_MODE = oldMode;
      process.env.DASHSCOPE_API_KEY = oldKey;
      process.env.DASHSCOPE_BASE_URL = oldBase;
      globalThis.fetch = oldFetch;
    }

    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("NEEDS_REVIEW");
    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.reviewStatus).toBe("AWAITING_REVIEW");
    expect(image.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 3600000,
    );
  });

  it("FAILED 超过 30 天的任务被清理", async () => {
    const student = await seedStudent();
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: { studentId: student.id, subject: "MATH", status: "NEEDS_REVIEW" },
    });
    await prisma.analysisJob.create({
      data: {
        wrongQuestionId: wrongQuestion.id,
        status: "FAILED",
        updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await runDataCleanup(prisma);
    expect(result.failedJobsCleaned).toBe(1);
  });
});
