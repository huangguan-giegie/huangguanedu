// 数据清理入口：npm run data:cleanup（生产由外部 cron 每日调用）
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { runDataCleanup } from "../src/lib/cleanup";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

runDataCleanup(prisma)
  .then((result) => {
    console.log(`清理完成: 删除图片 ${result.deletedImages} 张, 清理失败任务 ${result.failedJobsCleaned} 个`);
  })
  .catch((error) => {
    console.error("数据清理失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
