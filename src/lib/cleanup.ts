// 数据清理：删除过期临时原图、失败任务残留（生产由外部 cron 每日调用）
import type { PrismaClient } from "../generated/prisma/client";
import { getStorage } from "./storage";

export interface CleanupResult {
  deletedImages: number;
  failedJobsCleaned: number;
  autoReviewed: number;
}

export async function runDataCleanup(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<CleanupResult> {
  // 1. 过期原图：删除文件并标记 deletedAt
  // 尚未进入终态（分析中/待学生确认）的题目保留原图，等待学生反馈或 7 天自动转复核
  const expiredImages = await prisma.rawQuestionImage.findMany({
    where: {
      deletedAt: null,
      expiresAt: { lt: now },
      wrongQuestion: {
        is: { status: { notIn: ["PROCESSING", "PENDING_STUDENT_CONFIRMATION"] } },
      },
    },
  });
  for (const image of expiredImages) {
    await getStorage().delete(image.filePath).catch(() => undefined);
  }
  await prisma.rawQuestionImage.updateMany({
    where: { id: { in: expiredImages.map((i) => i.id) } },
    data: { deletedAt: now, reviewStatus: "EXPIRED" },
  });

  // 2. 失败任务残留：FAILED 且 30 天前不再更新的任务删除
  const failedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const failedJobs = await prisma.analysisJob.deleteMany({
    where: { status: "FAILED", updatedAt: { lt: failedCutoff } },
  });

  // 3. 待学生确认超过 7 天未反馈：自动转为老师复核
  const confirmationCutoff = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const pending = await prisma.wrongQuestion.findMany({
    where: {
      status: "PENDING_STUDENT_CONFIRMATION",
      updatedAt: { lt: confirmationCutoff },
      deletedAt: null,
    },
    select: { id: true },
  });
  const pendingIds = pending.map((p) => p.id);
  const autoReviewed = await prisma.wrongQuestion.updateMany({
    where: {
      status: "PENDING_STUDENT_CONFIRMATION",
      updatedAt: { lt: confirmationCutoff },
      deletedAt: null,
    },
    data: { status: "NEEDS_REVIEW", needsTeacherReview: true },
  });
  // 自动转入复核后，原图按复核规则保留至审核完成（最长 7 天）
  if (pendingIds.length > 0) {
    await prisma.rawQuestionImage.updateMany({
      where: { wrongQuestionId: { in: pendingIds }, deletedAt: null },
      data: {
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        reviewStatus: "AWAITING_REVIEW",
      },
    });
  }

  return {
    deletedImages: expiredImages.length,
    failedJobsCleaned: failedJobs.count,
    autoReviewed: autoReviewed.count,
  };
}
