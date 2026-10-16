/* 换肤前后对照拍摄。
   dev 模式下 globals.css 与 theme-08t.css 被合并进同一张样式表（实测 223 条规则里
   同时含 --paper-raised），运行时拆不开，所以只能在源码层面临时注释掉 import。

   用法：
     node scripts/shot-08t-beforeafter.cjs after     # 08T 生效（正常状态）
     node scripts/shot-08t-beforeafter.cjs before    # 需要事先注释掉 layout.tsx 里的 import

   脚本会自己检查当前源码状态与 mode 是否一致，不一致直接报错，避免拍出一组假对照。
*/
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_BASE || 'http://localhost:3000';
const DB_URL = process.env.DATABASE_URL
  || 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'deliverables', '08t-rollout-2026-10-13', 'compare');

const MODE = process.argv[2] === 'before' ? 'before' : 'after';

// 源码状态自检：theme-08t.css 的 import 是否处于激活状态
const layoutSrc = fs.readFileSync(path.join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
const importActive = /^\s*import\s+["']\.\/theme-08t\.css["'];/m.test(layoutSrc);
if (MODE === 'before' && importActive) {
  console.error('当前 layout.tsx 里 theme-08t.css 仍处于激活状态，拍不出"前"。');
  console.error('请先注释掉该行再跑：node scripts/shot-08t-beforeafter.cjs before');
  process.exit(1);
}
if (MODE === 'after' && !importActive) {
  console.error('当前 layout.tsx 里 theme-08t.css 未激活，拍不出"后"。');
  process.exit(1);
}

async function loginCookies(role) {
  const [phone, password] = { FAMILY: ['13800000003', 'Temp@123456'], TEACHER: ['13800000002', 'Temp@123456'] }[role];
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ phone, password }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(), domain: 'localhost', path: '/', sameSite: 'Lax' };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  const wq = (await db.query(`select id from "WrongQuestion" where status='PUBLISHED' and "deletedAt" is null limit 1`)).rows[0].id;
  await db.end();

  const browser = await chromium.launch();
  const pages = [
    ['home', '/', 'FAMILY'],
    ['wrong-questions', '/wrong-questions', 'FAMILY'],
    ['wrong-question-detail', `/wrong-questions/${wq}`, 'FAMILY'],
    ['practice', '/practice', 'FAMILY'],
    ['login', '/login', null],
  ];

  for (const [name, route, role] of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 2 });
    if (role) await ctx.addCookies(await loginCookies(role));
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.screenshot({ path: path.join(OUT, `${name}-${MODE}.png`) });
    console.log(`${name.padEnd(22)} [${MODE}] 底色=${bg}`);
    await ctx.close();
  }
  await browser.close();
})();
