// E2E 全局准备：启动嵌入式 PostgreSQL，创建独立 e2e 数据库，应用迁移并写入演示数据。
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { applyTestMigrations } from "../src/lib/test-migrations";
import { getOrStartTestPostgres } from "../src/lib/test-postgres";

const E2E_DB_NAME = "yy_e2e";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const pg = await getOrStartTestPostgres();
  await pg.dropDatabase(E2E_DB_NAME).catch(() => undefined);
  await pg.createDatabase(E2E_DB_NAME);
  const e2eUrl = pg.url(E2E_DB_NAME);

  await applyTestMigrations(e2eUrl);

  const env = { ...process.env, DATABASE_URL: e2eUrl };
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "prisma/seed.ts",
    ],
    { env, stdio: "inherit" },
  );

  process.env.E2E_DATABASE_URL = e2eUrl;

  return async () => {
    pg.stop();
  };
}
