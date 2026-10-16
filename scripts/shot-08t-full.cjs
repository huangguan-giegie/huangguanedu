/* 08T 全站落地截图：19 个路由 × 角色 + 移动端。
   每个页面除了截图，还实测四项「皮肤是否真生效」的 computed style，
   避免出现"看起来像但其实没生效"的假验收：
     · body 背景色    → 应是 #faf6ee (250,246,238)
     · body 背景图    → 应含 radial-gradient（暖纸底 + 网格）
     · h1 字体        → 应含 LXGW WenKai
     · .app-sidebar   → backdrop-filter 应为 none（08T 故意撤掉了最贵的一处模糊）

   用法：node scripts/shot-08t-full.cjs
*/
const { chromium } = require('playwright');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_BASE || 'http://localhost:3000';
const DB_URL = process.env.DATABASE_URL
  || 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu';
const OUT = path.join(__dirname, '..', 'deliverables', '08t-rollout-2026-10-13', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNTS = {
  FAMILY: { phone: '13800000003', password: 'Temp@123456' },
  TEACHER: { phone: '13800000002', password: 'Temp@123456' },
  ADMIN: { phone: '13800000001', password: 'Temp@123456' },
};

/** 通过接口登录，拿到可注入浏览器的 Cookie（比驱动登录表单稳） */
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
    const secure = /;\s*Secure/i.test(c);
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: 'localhost',
      path: '/',
      httpOnly: /HttpOnly/i.test(c),
      secure,
      sameSite: 'Lax',
    };
  });
}

const PROBE = () => {
  const bodyCs = getComputedStyle(document.body);
  const h1 = document.querySelector('h1, h2');
  const side = document.querySelector('.app-sidebar');
  const sideCs = side ? getComputedStyle(side) : null;
  const before = getComputedStyle(document.body, '::before');
  return {
    bodyBg: bodyCs.backgroundColor,
    // 08T 用 4 层 linear-gradient 画工程网格（不是 radial-gradient，别查错关键词）
    hasGrid: /linear-gradient/.test(bodyCs.backgroundImage),
    titleFont: h1 ? getComputedStyle(h1).fontFamily.slice(0, 80) : null,
    // 假玻璃的关键承诺：侧栏不再有 backdrop-filter
    sidebarBlur: sideCs ? sideCs.backdropFilter : null,
    // 宽屏才有视口边缘微光（伪元素 content 为空则说明媒体查询没匹配上）
    edgeGlow: before.content !== 'none' && before.position === 'fixed',
    cards: document.querySelectorAll('.link-card, .glass, [class*="card"], table').length,
  };
};

const ROUTES = {
  FAMILY: [
    ['home', '/'],
    ['wrong-questions', '/wrong-questions'],
    ['wrong-question-detail', null], // 运行时用第一家错题 id 替换
    ['wrong-questions-new', '/wrong-questions/new'],
    ['practice', '/practice'],
    ['practice-detail', null], // 运行时用第一个练习集 id 替换
    ['practice-sets', '/practice-sets'],
    ['reports', '/reports'],
    ['bookings', '/bookings'],
    ['account', '/account'],
    ['change-password', '/change-password'],
  ],
  TEACHER: [
    ['teacher-review', '/teacher/review'],
    ['teacher-students', '/teacher/students'],
    ['teacher-student-wrong-questions', null], // 运行时用学生 id 替换
    ['teacher-summaries', '/teacher/summaries'],
  ],
  ADMIN: [
    ['admin-slots', '/admin/slots'],
    ['admin-students', '/admin/students'],
    ['admin-teachers', '/admin/teachers'],
  ],
};

const MOBILE = [
  ['home-mobile', '/'],
  ['wrong-questions-mobile', '/wrong-questions'],
  ['practice-mobile', '/practice'],
];

// 详情页用的 id 直接查库拿，省得外面手动传
async function loadIds() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const q = async (sql) => (await c.query(sql)).rows[0]?.id ?? '';
    return {
      wrongQuestionId: await q(`select id from "WrongQuestion" where status = 'PUBLISHED' and "deletedAt" is null limit 1`),
      practiceSetId: await q('select id from "PracticeSet" order by "createdAt" limit 1'),
      studentId: await q('select id from "Student" order by "createdAt" limit 1'),
    };
  } finally {
    await c.end();
  }
}

(async () => {
  const ids = await loadIds();
  console.log('详情页 ID：' + JSON.stringify(ids));
  for (const list of Object.values(ROUTES)) {
    for (const row of list) {
      if (row[1] === null) {
        if (row[0] === 'wrong-question-detail') row[1] = `/wrong-questions/${ids.wrongQuestionId}`;
        if (row[0] === 'practice-detail') row[1] = `/practice/${ids.practiceSetId}`;
        if (row[0] === 'teacher-student-wrong-questions') row[1] = `/teacher/students/${ids.studentId}/wrong-questions`;
      }
    }
  }

  const browser = await chromium.launch();
  const problems = [];
  const report = [];

  async function shoot(context, name, route, viewport) {
    const page = await context.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));

    let status = '?';
    let finalUrl = route;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      status = resp ? resp.status() : '?';
      finalUrl = new URL(page.url()).pathname;
      await page.waitForTimeout(700);
    } catch (e) {
      errs.push('NAV ' + e.message.slice(0, 120));
    }

    const probe = await page.evaluate(PROBE).catch(() => ({}));
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
    await page.close();

    const redirected = finalUrl !== route;
    const row = { name, route, finalUrl, status, errs, probe };
    report.push(row);
    if (errs.length || redirected || status >= 400) {
      problems.push(`${name.padEnd(34)} http=${status}${redirected ? ` 重定向→${finalUrl}` : ''}${errs.length ? ' err=' + errs[0] : ''}`);
    }
    const skin = probe.bodyBg === 'rgb(250, 246, 238)' ? 'OK' : '!! ' + probe.bodyBg;
    console.log(
      `${name.padEnd(34)} ${String(status).padEnd(4)} ${(redirected ? '→' + finalUrl : '').padEnd(28)} 底色=${skin}` +
      ` 网格=${probe.hasGrid ? 'Y' : 'N'} 文楷=${/WenKai/.test(probe.titleFont || '') ? 'Y' : 'N'}` +
      ` 侧栏模糊=${probe.sidebarBlur ?? '(无侧栏)'} 边缘光=${probe.edgeGlow ? 'Y' : 'N'}`,
    );
    return row;
  }

  const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

  // ── 公开页 ─────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(desktop);
    await shoot(ctx, 'login', '/login', desktop);
    await ctx.close();
  }

  // ── 各角色 ─────────────────────────────────────────────────────────────
  for (const [role, routes] of Object.entries(ROUTES)) {
    const cookies = await loginCookies(role);
    const ctx = await browser.newContext(desktop);
    await ctx.addCookies(cookies);
    for (const [name, route] of routes) await shoot(ctx, name, route, desktop);
    await ctx.close();
  }

  // ── 移动端 ─────────────────────────────────────────────────────────────
  {
    const cookies = await loginCookies('FAMILY');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies);
    for (const [name, route] of MOBILE) await shoot(ctx, name, route, null);
    // 底部 Tab 栏是否存在 + 触控目标尺寸
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const tab = await page.evaluate(() => {
      const el = document.querySelector('nav[class*="tab"], .bottom-tab, [role="tablist"]');
      if (!el) return { found: false };
      const items = [...el.querySelectorAll('a, button')].map((a) => {
        const r = a.getBoundingClientRect();
        return { text: (a.textContent || '').trim().slice(0, 6), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const cs = getComputedStyle(el);
      return { found: true, position: cs.position, backdropFilter: cs.backdropFilter, items };
    });
    console.log('\n移动端底部导航：' + JSON.stringify(tab));
    await page.close();
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, '..', 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log('\n──────── 汇总 ────────');
  console.log(`截图 ${report.length} 张 → ${OUT}`);
  console.log(`异常 ${problems.length} 条`);
  problems.forEach((p) => console.log('  ' + p));

  await browser.close();
})();
