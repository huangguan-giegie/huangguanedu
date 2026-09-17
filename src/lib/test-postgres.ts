// 测试专用嵌入式 PostgreSQL：使用 @embedded-postgres/windows-x64 的本地二进制，
// 在无 Docker 的 Windows 开发机上启动临时实例，供 Vitest/Playwright 使用。
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import { Client } from "pg";

const require = createRequire(join(process.cwd(), "package.json"));
// 通过包根导出（dist/index.js）定位包根目录
const pkgDir = dirname(dirname(require.resolve("@embedded-postgres/windows-x64")));
const binDir = join(pkgDir, "native", "bin");

export const DEFAULT_TEST_PG_PORT = 55432;

function markerPath(port: number): string {
  return join(tmpdir(), `yy-pg-port-${port}.datadir`);
}

export interface TestPostgres {
  port: number;
  dataDir: string;
  adminUrl: string;
  url(database: string): string;
  createDatabase(name: string): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  stop(): void;
}

function adminUrlFor(port: number): string {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}

export function urlFor(port: number, database: string): string {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
}

/** 尝试连接指定端口的 PostgreSQL，用于检测实例是否已在运行。 */
export async function isPostgresUp(port: number): Promise<boolean> {
  const client = new Client({ connectionString: adminUrlFor(port) });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** 启动嵌入式 PostgreSQL（阻塞直到可用），返回控制句柄。 */
export function startTestPostgres(port = DEFAULT_TEST_PG_PORT): TestPostgres {
  const dataDir = mkdtempSync(join(tmpdir(), "yy-pg-"));
  const logFile = join(dataDir, "postgres.log");

  const run = (
    cmd: string,
    args: string[],
    options: { stdio: "pipe" | "ignore" } = { stdio: "pipe" },
  ) => {
    const result = spawnSync(cmd, args, {
      stdio: options.stdio,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `嵌入式 PostgreSQL ${cmd} 失败：${result.stderr || result.stdout}`,
      );
    }
  };

  run(join(binDir, "initdb.exe"), [
    "-D",
    dataDir,
    "-U",
    "postgres",
    "-A",
    "trust",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  run(
    join(binDir, "pg_ctl.exe"),
    [
      "-D",
      dataDir,
      "-l",
      logFile,
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "start",
      "-w",
    ],
    { stdio: "ignore" },
  );

  const stop = () => {
    spawnSync(join(binDir, "pg_ctl.exe"), ["-D", dataDir, "stop", "-m", "fast"], {
      stdio: "ignore",
    });
    rmSync(markerPath(port), { force: true });
  };
  writeFileSync(markerPath(port), dataDir);
  // 进程正常退出时兜底停止，避免嵌入式 PostgreSQL 残留占用端口
  process.once("exit", stop);

  return {
    port,
    dataDir,
    adminUrl: adminUrlFor(port),
    url: (database) => urlFor(port, database),
    async createDatabase(name) {
      const client = new Client({ connectionString: adminUrlFor(port) });
      await client.connect();
      try {
        await client.query(`CREATE DATABASE "${name}"`);
      } finally {
        await client.end();
      }
    },
    async dropDatabase(name) {
      const client = new Client({ connectionString: adminUrlFor(port) });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
    stop,
  };
}

/** 获取可用的测试 PostgreSQL 实例：优先复用已在默认端口运行的实例。 */
export async function getOrStartTestPostgres(): Promise<TestPostgres> {
  const port = Number(process.env.YY_TEST_PG_PORT ?? DEFAULT_TEST_PG_PORT);
  if (await isPostgresUp(port)) {
    const ownedDataDir = (() => {
      try {
        const value = readFileSync(markerPath(port), "utf8").trim();
        return value || null;
      } catch {
        return null;
      }
    })();
    return {
      port,
      dataDir: "",
      adminUrl: adminUrlFor(port),
      url: (database) => urlFor(port, database),
      async createDatabase(name) {
        const client = new Client({ connectionString: adminUrlFor(port) });
        await client.connect();
        try {
          await client.query(`CREATE DATABASE "${name}"`);
        } finally {
          await client.end();
        }
      },
      async dropDatabase(name) {
        const client = new Client({ connectionString: adminUrlFor(port) });
        await client.connect();
        try {
          await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        } finally {
          await client.end();
        }
      },
      stop() {
        // 复用的实例若由本机启动过（标记文件存在），负责停止，避免进程残留
        if (ownedDataDir) {
          spawnSync(
            join(binDir, "pg_ctl.exe"),
            ["-D", ownedDataDir, "stop", "-m", "fast"],
            { stdio: "ignore" },
          );
          rmSync(markerPath(port), { force: true });
        }
      },
    };
  }
  return startTestPostgres(port);
}
