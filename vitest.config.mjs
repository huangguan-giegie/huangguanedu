import { defineConfig } from "vitest/config";

// Vitest 单元测试配置：Node 环境，测试文件与源码放在一起。
// 固定为单 worker + 文件串行：每个测试文件会用独立临时 SQLite 并执行一次
// prisma migrate deploy，并行时会同时启动多个 Prisma migration engine，
// 在资源受限的 Windows 上容易在 setup 阶段失败（Schema engine error）。
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/lib/test-setup.ts"],
    include: ["src/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    globalSetup: ["src/lib/vitest-global-setup.ts"],
  },
});
