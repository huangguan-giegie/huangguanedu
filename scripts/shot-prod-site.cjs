/* 线上截图（切换前后各跑一次，做对照）。
   用法：node scripts/shot-prod-site.cjs before   或   node scripts/shot-prod-site.cjs after
*/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TAG = process.argv[2] || 'shot';
const BASE = process.env.PROD_BASE || 'https://academy.huangguanedu.cn';
const OUT = path.resolve('deliverables/08t-rollout-2026-10-13/prod-verify', TAG);
fs.mkdirSync(OUT, { recursive: true });

const ACCOUNT = { phone: '13900000099', password: 'QaTest@2026' };

const PROBE = () => {
  const b = getComputedStyle(document.body);
  const h = document.querySelector('h1, h2, h3');
  return {
    bgColor: b.backgroundColor,
    bgImageHead: (b.backgroundImage || '').slice(0, 90),
    bodyFont: b.fontFamily,
    titleFont: h ? getComputedStyle(h).fontFamily : null,
    blurred: [...document.querySelectorAll('*')].filter((el) => {
      const v = getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter;
      return v && v !== 'none';
    }).length,
    canvases: document.querySelectorAll('canvas').length,
  };
};

(async () => {
  const browser = await chromium.launch();
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  async function loginCookies() {
    const r = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify(ACCOUNT),
    });
    if (r.status !== 200) { say(`  登录失败 ${r.status}`); return null; }
    return (r.headers.getSetCookie?.() ?? []).map((c) => {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(),
               domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax',
               httpOnly: /HttpOnly/i.test(c), secure: /;\s*Secure/i.test(c) };
    });
  }

  const shots = [
    { route: '/login', name: 'login-desktop', vp: { width: 1440, height: 900 }, auth: false },
    { route: '/login', name: 'login-mobile', vp: { width: 390, height: 844 }, auth: false, mobile: true },
    { route: '/', name: 'home-desktop', vp: { width: 1440, height: 900 }, auth: true },
    { route: '/wrong-questions', name: 'wq-desktop', vp: { width: 1440, height: 900 }, auth: true },
    { route: '/practice', name: 'practice-desktop', vp: { width: 1440, height: 900 }, auth: true },
    { route: '/reports', name: 'reports-desktop', vp: { width: 1440, height: 900 }, auth: true },
    { route: '/', name: 'home-mobile', vp: { width: 390, height: 844 }, auth: true, mobile: true },
  ];

  const jar = await loginCookies();
  say(`登录 ${jar ? 'OK' : '失败'}   目标 ${BASE}   标记 ${TAG}`);

  for (const s of shots) {
    if (s.auth && !jar) continue;
    const ctx = await browser.newContext({
      viewport: s.vp,
      ...(s.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    });
    if (s.auth) await ctx.addCookies(jar);
    const page = await ctx.newPage();
    let status = 0;
    try {
      const r = await page.goto(BASE + s.route, { waitUntil: 'networkidle', timeout: 45000 });
      status = r ? r.status() : 0;
    } catch (e) { say(`  !! ${s.route} ${String(e).slice(0, 90)}`); }
    await page.waitForTimeout(700);
    const p = await page.evaluate(PROBE).catch(() => null);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) }).catch(() => {});
    await page.close();
    await ctx.close();
    if (p) say(`  ${s.name.padEnd(18)} ${String(status).padEnd(4)} 底色=${p.bgColor.padEnd(20)} 标题字体=${String(p.titleFont).slice(0, 40).padEnd(42)} 模糊=${p.blurred} canvas=${p.canvases}`);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'probe.txt'), log.join('\n'), 'utf8');
  say(`产物：${OUT}`);
})().catch((e) => { console.error(String(e)); process.exit(1); });
