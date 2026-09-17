// 测试专用 PostgreSQL 迁移工具：通过 pg 驱动按顺序执行 prisma/migrations 下的迁移 SQL。
// 不依赖 Prisma Client，便于 Vitest 与 Playwright 复用。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

/** 对指定 PostgreSQL 连接串执行仓库内全部迁移 SQL。 */
export async function applyTestMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const migrationsPath = join(process.cwd(), "prisma", "migrations");
    const migrationDirectories = readdirSync(migrationsPath, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationDirectory of migrationDirectories) {
      const migrationFile = join(
        migrationsPath,
        migrationDirectory,
        "migration.sql",
      );
      try {
        await client.query(readFileSync(migrationFile, "utf8"));
      } catch (error) {
        throw new Error(`测试数据库迁移失败：${migrationDirectory}`, {
          cause: error,
        });
      }
    }
  } finally {
    await client.end();
  }
}
