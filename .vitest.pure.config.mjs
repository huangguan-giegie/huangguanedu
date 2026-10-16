// 临时配置：不加载 globalSetup / setupFiles（它们会拉起嵌入式 PostgreSQL），
// 只跑纯逻辑测试文件。本机安全策略会拦截从 node_modules 启动 initdb.exe。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/lib/analyzer/qwen.test.ts",
      "src/lib/latex-to-unicode.test.ts",
      "src/lib/diagram-description.test.ts",
      "src/lib/diagram-renderer/diagram-renderer.test.ts",
      "src/lib/practice-set.test.ts",
      "src/lib/practice-grading.test.ts",
    ],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
