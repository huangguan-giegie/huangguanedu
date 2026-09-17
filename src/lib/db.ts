// 共享 Prisma 客户端单例（服务端专用，避免每个请求重复创建连接）
// PostgreSQL：本地 Docker / 测试 / 生产 RDS 统一使用 PrismaPg 适配器
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

// 开发环境热更新时复用同一实例
const globalForPrisma = globalThis as unknown as { yyPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.yyPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.yyPrisma = prisma;
}
