// 学习总结定时任务入口：npm run summary:process（检查已结束周期并生成草稿/重试 AI）
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { processDueSummaries } from "../src/lib/summary";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

processDueSummaries(prisma)
  .then((result) => {
    console.log(
      `总结任务完成: 生成 ${result.generated} 份, AI 重试 ${result.retried} 份, 失败 ${result.errors} 项`,
    );
  })
  .catch((error) => {
    console.error("总结任务失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
