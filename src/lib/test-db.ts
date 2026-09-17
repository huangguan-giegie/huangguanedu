// 测试专用数据库工具：为每个测试文件创建隔离的临时 PostgreSQL 数据库并应用迁移。
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { applyTestMigrations } from "./test-migrations";
import { getOrStartTestPostgres } from "./test-postgres";

export { applyTestMigrations } from "./test-migrations";

let databaseUrl: string | null = null;

/** 获取测试数据库连接串：首次调用时创建独立数据库并应用全部迁移。 */
export async function getTestDatabaseUrl(): Promise<string> {
  if (databaseUrl) {
    return databaseUrl;
  }
  if (process.env.YY_TEST_DB_URL) {
    databaseUrl = process.env.YY_TEST_DB_URL;
    return databaseUrl;
  }

  const pg = await getOrStartTestPostgres();
  const databaseName = `yy_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await pg.createDatabase(databaseName);
  databaseUrl = pg.url(databaseName);
  process.env.YY_TEST_DB_URL = databaseUrl;

  await applyTestMigrations(databaseUrl);
  return databaseUrl;
}

/** 创建指向测试数据库的 Prisma 客户端实例。 */
export async function createTestPrisma(): Promise<PrismaClient> {
  const adapter = new PrismaPg({ connectionString: await getTestDatabaseUrl() });
  return new PrismaClient({ adapter });
}

/** 清空认证相关表，保证测试用例之间互不干扰。 */
export async function resetAuthTables(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.guardianConsent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSetting.deleteMany();
}
