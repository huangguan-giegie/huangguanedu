// 异步分析 worker：从任务表取 PENDING 任务，调用分析器，处理重试与失败
import type { PrismaClient } from "../generated/prisma/client";
import { getAnalyzer } from "./analyzer";
import { QwenAnalyzerError } from "./analyzer/qwen";
import { loadConfig } from "./config";
import { getStorageReadUrl } from "./storage";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

// 重试退避：第 n 次重试延迟 30s * n
function retryDelayMs(attempt: number): number {
  return 30_000 * attempt;
}

/**
 * 处理一批待执行的分析任务，返回处理数量。
 * 成功：写入结构化结果，错题进入"待学生确认"。
 * 可重试失败：attempts+1，重试次数内安排下次运行。
 * 不可重试或超限：任务 FAILED，错题直接进入老师复核（无学生确认入口）。
 */
export async function processAnalysisJobs(
  prisma: PrismaClient,
  limit = 10,
): Promise<number> {
  const config = loadConfig();
  // 服务重启后恢复超过执行时限的任务，避免一直显示分析中。
  await prisma.analysisJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - Math.max(config.qwen.requestTimeoutMs * 2, 300_000)) } },
    data: { status: "PENDING", lockedAt: null, nextRunAt: new Date() },
  });
  const jobs = await prisma.analysisJob.findMany({
    where: {
      status: "PENDING",
      nextRunAt: { lte: new Date() },
      lockedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      wrongQuestion: {
        include: { rawImages: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      },
    },
  });

  let processed = 0;
  for (const job of jobs) {
    // 抢占任务，避免并发 worker 重复处理
    const claimed = await prisma.analysisJob.updateMany({
      where: { id: job.id, lockedAt: null, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date() },
    });
    if (claimed.count === 0) {
      continue;
    }

    const analyzer = getAnalyzer();
    const images = job.wrongQuestion.rawImages;
    const image = images[0];
    // OSS 使用短期签名 URL，本地图片由服务端转为数据 URL。
    const imageUrls: string[] = [];
    try {
      if (config.qwen.mode === "live") {
        for (const page of images) {
          let url = await getStorageReadUrl(page.filePath, 300);
          if (!url) {
            const root = resolve(process.env.STORAGE_DIR ?? resolve(process.cwd(), "storage"));
            const file = resolve(/* turbopackIgnore: true */ root, page.filePath);
            if (!file.startsWith(root + sep)) throw new Error("非法图片路径");
            url = `data:${page.mimeType};base64,${(await readFile(file)).toString("base64")}`;
          }
          imageUrls.push(url);
        }
      }
      const result = await analyzer.analyze({
        imageUrl: imageUrls[0],
        imageUrls,
        model: job.modelOverride ?? undefined,
        mimeType: image?.mimeType === "image/png" ? "image/png" : "image/jpeg",
        subject: job.wrongQuestion.subject,
      });

      await prisma.$transaction(async (tx) => {
        await tx.wrongQuestion.update({
          where: { id: job.wrongQuestionId },
          data: {
            status: "PENDING_STUDENT_CONFIRMATION",
            recognizedQuestion: result.recognizedQuestion,
            questionType: result.questionType,
            correctSteps: result.correctSteps,
            thinkingHint: result.thinkingHint,
            finalAnswer: result.finalAnswer,
            errorCauses: result.errorCauses,
            knowledgePoints: result.knowledgePoints,
            difficulty: result.difficulty,
            aiConfidence: result.aiConfidence,
            remedialPractice: result.remedialPractice,
            studentWorkDetected: result.studentWorkDetected,
            studentWorkTranscription: result.studentWorkTranscription,
            studentApproach: result.studentApproach,
            firstErrorStep: result.firstErrorStep,
            misconception: result.misconception,
            whatStudentDidWell: result.whatStudentDidWell,
            isAiGenerated: true,
            needsTeacherReview: result.needsTeacherReview,
          },
        });
        // 知识点落独立表，供筛选与统计
        for (const point of result.knowledgePoints) {
          await tx.wrongQuestionKnowledgePoint.upsert({
            where: {
              wrongQuestionId_knowledgePoint: {
                wrongQuestionId: job.wrongQuestionId,
                knowledgePoint: point,
              },
            },
            update: {},
            create: {
              wrongQuestionId: job.wrongQuestionId,
              knowledgePoint: point,
            },
          });
        }
        await tx.analysisJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            lockedAt: null,
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      const retryable = error instanceof QwenAnalyzerError && error.retryable;
      const attempts = job.attempts + 1;
      const failed = !retryable || attempts > config.qwen.maxRetries;

      await prisma.$transaction(async (tx) => {
        if (failed) {
          await tx.analysisJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              attempts,
              lockedAt: null,
              lastError:
                error instanceof Error ? error.message : "未知错误",
            },
          });
          // 任务失败无学生确认入口，直接进入老师复核
          await tx.wrongQuestion.update({
            where: { id: job.wrongQuestionId },
            data: { status: "NEEDS_REVIEW", needsTeacherReview: true },
          });
          // 任务失败进入老师复核队列：原图按复核规则最长保留 7 天
          await tx.rawQuestionImage.updateMany({
            where: { wrongQuestionId: job.wrongQuestionId, deletedAt: null },
            data: {
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              reviewStatus: "AWAITING_REVIEW",
            },
          });
        } else {
          await tx.analysisJob.update({
            where: { id: job.id },
            data: {
              status: "PENDING",
              attempts,
              lockedAt: null,
              nextRunAt: new Date(Date.now() + retryDelayMs(attempts)),
              lastError:
                error instanceof Error ? error.message : "未知错误",
            },
          });
        }
      });
    }
    processed += 1;
  }

  return processed;
}
