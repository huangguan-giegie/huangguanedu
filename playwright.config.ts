import { defineConfig, devices } from "@playwright/test";

// 与 e2e/global-setup.ts 保持一致：E2E 数据库位于当前仓库根（随 checkout 变化），
// 使用嵌入式 PostgreSQL 的独立数据库，避免 dev server 连接到旧数据库导致登录失败。
const E2E_DB =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55432/yy_e2e";

// Playwright E2E 测试配置：独立 PostgreSQL 数据库 + 移动端视口 + 自动启动开发服务器
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    locale: "zh-CN",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    // Windows 下用 node 直接启动，确保 webServer.env（DATABASE_URL=e2e.db）可靠传递；
    // 经 npm.cmd 批处理启动时环境变量可能丢失，导致 dev server 回落到 dev.db 而使登录失败。
    command: "node node_modules/next/dist/bin/next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
    },
  },
});
