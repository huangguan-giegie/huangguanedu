// CSS 语法体检 —— 补 tsc 与 eslint 都覆盖不到的盲区。
//
// 为什么需要：2026-10-16 那次部署，本地 25 项终验全绿、
// tsc exit 0、eslint 0 errors、202 单测通过，
// 但 `next build` 在服务器上炸了：
//
//   practice.module.css:188  Syntax error: Unexpected '/'
//   > 删掉全部 fallback，让 token 拼写错误立即暴露而不是静默回退到旧配色。 */
//
// 根因是删旧注释时把 CSS 注释的起始符号一起删了，尾行裸露在样式表里。
// tsc 不看 CSS，eslint 也不看，只有 webpack 的 css-loader 会报错。
//
// 用法：node scripts/check-css.mjs
// 退出码 0 = 全部通过；非 0 = 有语法错误，勿部署。
import postcss from "postcss";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "src";
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (extname(p) === ".css") files.push(p);
  }
}
walk(ROOT);

const errors = [];
for (const f of files) {
  try {
    postcss.parse(readFileSync(f, "utf8"), { from: f });
  } catch (e) {
    errors.push({ file: f, message: e.message });
  }
}

if (errors.length === 0) {
  console.log(`✓ ${files.length} 个 CSS 文件语法通过`);
} else {
  console.error(`✗ ${errors.length}/${files.length} 个 CSS 有语法错误：\n`);
  for (const e of errors) console.error(`  ${e.file}\n    ${e.message}\n`);
  process.exit(1);
}
