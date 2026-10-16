import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.cjs", "ops/**/*.cjs"],
    // 运维与验收脚本使用 Node.js 原生 CommonJS 格式。
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".worktrees/**",
    "node_modules/**",
    // 固定版本的第三方资源保持原样，只检查本站源码。
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
