// ECS 生产任务调度器：分析任务每分钟执行；总结生成与数据清理每日执行。
// 单次失败写入日志并继续；连续失败超过阈值时以非零状态退出，便于监控发现。
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { processAnalysisJobs } from "../src/lib/analysis-worker";
import { runDataCleanup } from "../src/lib/cleanup";
import { PrismaClient } from "../src/generated/prisma/client";
import { processDueSummaries } from "../src/lib/summary";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

const ANALYSIS_INTERVAL_MS = Number(
  process.env.JOB_ANALYSIS_INTERVAL_MS ?? 60_000,
);
const DAILY_INTERVAL_MS = Number(
  process.env.JOB_DAILY_INTERVAL_MS ?? 24 * 60 * 60 * 1000,
);
const MAX_CONSECUTIVE_FAILURES = 5;

let consecutiveFailures = 0;
let shuttingDown = false;

async function runSafely(name: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
    consecutiveFailures = 0;
  } catch (error) {
    consecutiveFailures += 1;
    console.error(`[scheduler] ${name} 失败（第 ${consecutiveFailures} 次）:`, error);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error("[scheduler] 连续失败过多，退出");
      process.exit(1);
    }
  }
}

async function runAnalysis(): Promise<void> {
  const limit = Number(process.env.ANALYSIS_BATCH_SIZE ?? 10);
  const count = await processAnalysisJobs(prisma, limit);
  console.log(`[scheduler] 分析任务: 处理 ${count} 个`);
}

async function runDaily(): Promise<void> {
  const summary = await processDueSummaries(prisma);
  console.log(
    `[scheduler] 总结任务: 生成 ${summary.generated}, 重试 ${summary.retried}, 失败 ${summary.errors}`,
  );
  const cleanup = await runDataCleanup(prisma);
  console.log(
    `[scheduler] 清理任务: 图片 ${cleanup.deletedImages}, 失败任务 ${cleanup.failedJobsCleaned}, 自动复核 ${cleanup.autoReviewed}`,
  );
}

async function main(): Promise<void> {
  console.log(`[scheduler] 启动，分析间隔 ${ANALYSIS_INTERVAL_MS}ms，每日任务间隔 ${DAILY_INTERVAL_MS}ms`);

  await runSafely("分析任务(启动)", runAnalysis);
  await runSafely("每日任务(启动)", runDaily);

  const analysisTimer = setInterval(
    () => void runSafely("分析任务", runAnalysis),
    ANALYSIS_INTERVAL_MS,
  );
  const dailyTimer = setInterval(
    () => void runSafely("每日任务", runDaily),
    DAILY_INTERVAL_MS,
  );

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    clearInterval(analysisTimer);
    clearInterval(dailyTimer);
    await prisma.$disconnect();
    console.log("[scheduler] 已停止");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[scheduler] 启动失败:", error);
  process.exit(1);
});
