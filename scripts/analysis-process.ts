// 异步分析处理入口：npm run analysis:process（可被外部调度按需调用）
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { processAnalysisJobs } from "../src/lib/analysis-worker";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

const limit = Number(process.env.ANALYSIS_BATCH_SIZE ?? 10);

processAnalysisJobs(prisma, limit)
  .then((count) => {
    console.log(`已处理 ${count} 个分析任务`);
  })
  .catch((error) => {
    console.error("分析处理失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
