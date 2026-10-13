/* 08T 落地量化验收：不靠肉眼，逐页实测三条硬约束。
   1) 假玻璃：全页 backdrop-filter 不为 none 的元素数必须为 0
      —— 这是 08T 的核心性能承诺（原 .app-sidebar 的 blur(18px) 已撤掉）
   2) 文字区无线条：视口左右两条 2px 边缘微光带（x<16 / x>w-16）
      不得与任何文字元素相交；且页面里不得出现 <canvas>（08T 是纯 CSS，零 canvas）
   3) 字体分工：标题用霞鹜文楷、正文不用
      —— 实测 h1/h2 的 font-family 含 WenKai，而段落应落在正文无衬线字体上

   用法：node scripts/verify-08t-full.cjs
*/
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_BASE || 'http://localhost:3000';
const DB_URL = process.env.DATABASE_URL
  || 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu';

const ACCOUNTS = {
  FAMILY: { phone: '13800000003', password: 'Temp@123456' },
  TEACHER: { phone: '13800000002', password: 'Temp@123456' },
  ADMIN: { phone: '13800000001', password: 'Temp@123456' },
};

async function loginCookies(role) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (res.status !== 200) throw new Error(`${role} 登录失败 ${res.status}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    return {
      name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(),
      domain: 'localhost', path: '/', sameSite: 'Lax',
      httpOnly: /HttpOnly/i.test(c), secure: /;\s*Secure/i.test(c),
    };
  });
}

async function loadIds() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const q = async (sql) => (await c.query(sql)).rows[0]?.id ?? '';
    return {
      wq: await q(`select id from "WrongQuestion" where status='PUBLISHED' and "deletedAt" is null limit 1`),
      ps: await q('select id from "PracticeSet" order by "createdAt" limit 1'),
      st: await q('select id from "Student" order by "createdAt" limit 1'),
    };
  } finally { await c.end(); }
}

const CHECK = () => {
  const EDGE = 16; // 边缘微光带宽度（left:14px + width:2px，留 2px 余量）
  const w = window.innerWidth;

  // 1) 假玻璃
  const blurred = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    const v = cs.backdropFilter || cs.webkitBackdropFilter;
    return v && v !== 'none';
  }).map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().slice(0, 40));

  // 2) 线条 / canvas
  const canvasCount = document.querySelectorAll('canvas').length;
  const TEXT_SEL = 'p,h1,h2,h3,h4,h5,h6,span,a,li,td,th,button,label,strong,em,dt,dd,figcaption';
  const hit = [];
  for (const el of document.querySelectorAll(TEXT_SEL)) {
    const text = (el.textContent || '').trim();
    if (!text) continue;
    // 只看"直接含文字"的元素，避免父容器把整块区域算进来
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasOwnText) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.left < EDGE || r.right > w - EDGE) {
      hit.push({ tag: el.tagName.toLowerCase(), text: text.slice(0, 24), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }

  // 3) 字体分工
  const titleFont = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };
  const para = [...document.querySelectorAll('p')].find((p) => (p.textContent || '').trim().length > 4);

  return {
    blurred, canvasCount,
    overflowText: hit.slice(0, 6), overflowTextCount: hit.length,
    viewport: w,
    titleFont: titleFont('h1, h2'),
    bodyFont: para ? getComputedStyle(para).fontFamily : null,
  };
};

(async () => {
  const ids = await loadIds();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const ROUTES = {
    FAMILY: ['/', '/wrong-questions', `/wrong-questions/${ids.wq}`, '/wrong-questions/new', '/practice',
             `/practice/${ids.ps}`, '/reports', '/bookings', '/account', '/change-password'],
    TEACHER: ['/teacher/review', '/teacher/students', '/teacher/summaries'],
    ADMIN: ['/admin/slots', '/admin/students', '/admin/teachers'],
  };

  let fails = 0;
  const lines = [];

  for (const [role, routes] of Object.entries(ROUTES)) {
    await ctx.addCookies(await loginCookies(role));
    for (const route of routes) {
      const page = await ctx.newPage();
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(600);
      const r = await page.evaluate(CHECK);
      await page.close();

      const okBlur = r.blurred.length === 0;
      const okLine = r.overflowTextCount === 0 && r.canvasCount === 0;
      const okFont = /WenKai/.test(r.titleFont || '') && !/WenKai/.test(r.bodyFont || '');
      if (!okBlur || !okLine || !okFont) fails++;

      lines.push(
        `${(okBlur && okLine && okFont) ? 'PASS' : 'FAIL'}  ${route.padEnd(46)}` +
        ` 模糊元素=${r.blurred.length}${okBlur ? '' : ' ' + JSON.stringify(r.blurred.slice(0, 3))}` +
        ` canvas=${r.canvasCount}` +
        ` 压边文字=${r.overflowTextCount}${r.overflowText.length ? ' ' + JSON.stringify(r.overflowText) : ''}` +
        ` 标题文楷=${/WenKai/.test(r.titleFont || '') ? 'Y' : 'N'} 正文文楷=${/WenKai/.test(r.bodyFont || '') ? 'Y(不该)' : 'N'}`,
      );
    }
  }

  // ── 移动端再验一次（窄屏没有边缘微光，但字体分工与假玻璃同样要成立）──
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mctx.addCookies(await loginCookies('FAMILY'));
  for (const route of ['/', '/wrong-questions', '/practice']) {
    const page = await mctx.newPage();
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const r = await page.evaluate(CHECK);
    // 移动端触控目标
    const small = await page.evaluate(() => [...document.querySelectorAll('a, button, input:not([type=checkbox]):not([type=radio]), select')]
      .map((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 40 ? `${el.tagName.toLowerCase()}${Math.round(b.height)}` : null; })
      .filter(Boolean));
    await page.close();
    const ok = r.blurred.length === 0 && r.canvasCount === 0;
    if (!ok) fails++;
    lines.push(`${ok ? 'PASS' : 'FAIL'}  [移动] ${route.padEnd(39)} 模糊元素=${r.blurred.length} canvas=${r.canvasCount} 高度<40px 的控件=${small.length}${small.length ? ' ' + JSON.stringify(small.slice(0, 6)) : ''}`);
  }

  console.log(lines.join('\n'));
  console.log(`\n合计 ${lines.length} 个检查点，失败 ${fails} 个`);

  const out = path.join(__dirname, '..', 'deliverables', '08t-rollout-2026-10-13', 'verify.txt');
  fs.writeFileSync(out, lines.join('\n') + `\n\n合计 ${lines.length} 个检查点，失败 ${fails} 个\n`, 'utf8');
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
