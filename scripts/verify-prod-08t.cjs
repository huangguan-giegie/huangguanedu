/* 线上（academy.huangguanedu.cn）08T 落地验收。
   只测「跑在服务器上的东西」——不读本地文件、不 grep 源码，全部经 HTTP / 浏览器实测。

   A. 原始 HTTP：把首页引用的每份 CSS 抓下来，找 08T 特征（faf6ee / --paper-raised / LXGW WenKai / @font-face）
   B. 字体：/fonts/lxgw-wenkai-title.woff2 必须 200 且 ~278 KB，魔数 wOF2
   C. 浏览器：登录前后各测一遍 computed style（底色暖纸 / 网格 background-image / 标题文楷 / 正文非文楷）
      外加 08T 的两条硬承诺：backdrop-filter 非 none 元素 = 0、<canvas> = 0
   D. 截图留档

   用法：
     node scripts/verify-prod-08t.cjs
     node scripts/verify-prod-08t.cjs --shoot-only
*/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.PROD_BASE || 'https://academy.huangguanedu.cn';
const OUT = path.resolve('deliverables/08t-rollout-2026-10-13/prod-verify');
const ACCOUNT = { phone: '13900000099', password: 'QaTest@2026' };

const PAPER = 'rgb(250, 246, 238)'; // #faf6ee

fs.mkdirSync(OUT, { recursive: true });

const log = [];
function say(s) { console.log(s); log.push(s); }
function head(s) { say(''); say(`===== ${s} =====`); }

/* ───────── A. 原始 HTTP：CSS 里到底有没有 08T ───────── */
async function probeCss() {
  head('A. 样式表实测（原始 HTTP）');
  const res = await fetch(BASE + '/login', { redirect: 'follow' });
  const html = await res.text();
  say(`GET /login -> ${res.status}  ${html.length} 字节`);

  const hrefs = [...new Set([...html.matchAll(/\/_next\/static\/css\/[^"'\s]+?\.css/g)].map((m) => m[0]))];
  say(`页面引用样式表 ${hrefs.length} 份`);

  const found = [];
  for (const href of hrefs) {
    const r = await fetch(BASE + href);
    const css = await r.text();
    const hasPaper = css.includes('faf6ee');
    const hasRaised = css.includes('--paper-raised');
    const hasWenkai = css.includes('LXGW WenKai');
    const hasFace = css.includes('@font-face');
    const hasGrid = css.includes('28px') && css.includes('112px');
    const blurs = (css.match(/backdrop-filter/g) || []).length;
    say(`  ${href}`);
    say(`     ${r.status}  ${css.length} 字节   faf6ee=${hasPaper ? 'Y' : 'n'} --paper-raised=${hasRaised ? 'Y' : 'n'} LXGW=${hasWenkai ? 'Y' : 'n'} @font-face=${hasFace ? 'Y' : 'n'} 网格=${hasGrid ? 'Y' : 'n'} backdrop-filter出现=${blurs}`);
    if (hasPaper) found.push({ href, bytes: css.length, hasRaised, hasWenkai, hasFace, hasGrid });
  }
  if (!found.length) throw new Error('线上样式表里找不到 08T 的底色 faf6ee —— 服务端跑的还是旧 UI');
  say(`=> 08T 样式已上线（命中 ${found.length} 份）`);
  return found;
}

/* ───────── B. 字体 ───────── */
async function probeFont() {
  head('B. 字体文件');
  const r = await fetch(BASE + '/fonts/lxgw-wenkai-title.woff2');
  const buf = Buffer.from(await r.arrayBuffer());
  const magic = buf.subarray(0, 4).toString('hex');
  say(`GET /fonts/lxgw-wenkai-title.woff2 -> ${r.status}  ${buf.length} 字节  magic=${magic}`);
  say(`  content-type: ${r.headers.get('content-type')}`);
  say(`  cache-control: ${r.headers.get('cache-control')}`);
  const ok = r.status === 200 && magic === '774f4632' && buf.length > 200000;
  if (!ok) throw new Error(`字体没被正确提供（status=${r.status} magic=${magic} size=${buf.length}）`);
  say('=> 字体可访问且是合法 woff2');
  return buf.length;
}

/* ───────── C. 浏览器实测 ───────── */
const CHECK = () => {
  const body = getComputedStyle(document.body);
  const blurred = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    const v = cs.backdropFilter || cs.webkitBackdropFilter;
    return v && v !== 'none';
  }).map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`);

  const h = document.querySelector('h1, h2, h3');
  const p = [...document.querySelectorAll('p')].find((x) => (x.textContent || '').trim().length > 4);

  // 边缘微光带（body::before/after，fixed，width 2px，left/right 14px）——用伪元素实例是否被渲染来判断
  let edge = { before: false, after: false };
  try {
    const has = (pseudo) => {
      const cs = getComputedStyle(document.body, pseudo);
      return !!(cs && cs.content && cs.content !== 'none' && cs.width === '2px');
    };
    edge = { before: has('::before'), after: has('::after') };
  } catch { /* 忽略 */ }

  return {
    title: document.title,
    url: location.href,
    bgColor: body.backgroundColor,
    bgImage: (body.backgroundImage || '').slice(0, 220),
    bgSize: body.backgroundSize || '',
    bodyColor: body.color,
    titleFont: h ? getComputedStyle(h).fontFamily : null,
    bodyFont: p ? getComputedStyle(p).fontFamily : null,
    blurred, canvasCount: document.querySelectorAll('canvas').length,
    edge,
    hasSidebarBlurClass: !!document.querySelector('.app-sidebar'),
  };
}

async function loginCookies() {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(ACCOUNT),
  });
  if (r.status !== 200) {
    say(`  登录 ${ACCOUNT.phone} -> ${r.status}，跳过登录后页面`);
    return null;
  }
  say(`  登录 ${ACCOUNT.phone} -> 200`);
  const jar = (r.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: new URL(BASE).hostname,
      path: '/',
      sameSite: 'Lax',
      httpOnly: /HttpOnly/i.test(c),
      secure: /;\s*Secure/i.test(c),
    };
  });
  return jar.length ? jar : null;
}

(async () => {
  const fontBytes = await probeFont();
  await probeCss();

  head('C. 浏览器实测');
  const browser = await chromium.launch();
  const results = [];
  let worst = [];

  async function visit(ctx, route, label, shot) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
    let status = 0;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
      status = resp ? resp.status() : 0;
    } catch (e) {
      say(`  !! ${label} ${route} 打不开：${String(e).slice(0, 120)}`);
    }
    await page.waitForTimeout(800);
    const r = await page.evaluate(CHECK).catch(() => null);
    if (shot && r) await page.screenshot({ path: path.join(OUT, shot), fullPage: false }).catch(() => {});
    await page.close();
    if (!r) return null;

    const paperOk = r.bgColor === PAPER;
    const gridOk = /linear-gradient/.test(r.bgImage);
    const wenkaiOk = /WenKai/.test(r.titleFont || '');
    const bodyClean = !/WenKai/.test(r.bodyFont || '');
    const glassOk = r.blurred.length === 0;
    const canvasOk = r.canvasCount === 0;
    const pass = paperOk && gridOk && wenkaiOk && bodyClean && glassOk && canvasOk;

    say(`${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(10)} ${route.padEnd(18)} HTTP=${status} 底色=${r.bgColor} 网格=${gridOk ? 'Y' : 'N'} 标题文楷=${wenkaiOk ? 'Y' : 'N'} 正文文楷=${bodyClean ? 'N' : 'Y(不该)'} 模糊=${r.blurred.length} canvas=${r.canvasCount} 边缘光=${r.edge.before ? 'L' : '-'}${r.edge.after ? 'R' : '-'} console错误=${errs.length}`);
    if (r.bgColor !== PAPER) say(`      ! 底色不是暖纸：${r.bgColor}（期望 ${PAPER}）`);
    if (r.blurred.length) say(`      ! 模糊元素：${JSON.stringify(r.blurred.slice(0, 4))}`);
    if (errs.length) say(`      ! console：${JSON.stringify(errs.slice(0, 3))}`);
    if (!pass) worst.push(`${label} ${route}`);
    results.push({ label, route, status, pass, ...r, consoleErrors: errs });
    return results[results.length - 1];
  }

  // 未登录
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await visit(anon, '/login', '匿名', '01-login-desktop.png');

  // 移动端登录页
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await visit(mob, '/login', '匿名移动', '02-login-mobile.png');

  // 已登录
  const jar = await loginCookies();
  if (jar) {
    const auth = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await auth.addCookies(jar);
    const routes = ['/', '/wrong-questions', '/practice', '/reports', '/bookings', '/account'];
    for (let i = 0; i < routes.length; i++) {
      await visit(auth, routes[i], '家长', `${String(10 + i).padStart(2, '0')}-family${routes[i].replace(/\//g, '-') || '-home'}.png`);
    }
    const authMob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await authMob.addCookies(jar);
    await visit(authMob, '/', '家长移动', '20-family-home-mobile.png');
    await visit(authMob, '/practice', '家长移动', '21-family-practice-mobile.png');
  }

  await browser.close();

  head('C 小结');
  const passN = results.filter((r) => r.pass).length;
  say(`通过 ${passN}/${results.length}`);
  if (worst.length) say(`未通过：${worst.join(' | ')}`);

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    base: BASE, at: new Date().toISOString(), fontBytes, results,
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'verify.txt'), log.join('\n'), 'utf8');
  say(`\n产物：${OUT}`);

  if (worst.length) process.exitCode = 1;
})().catch((e) => {
  say('');
  say('===== 失败 =====');
  say(String(e && e.message || e));
  fs.writeFileSync(path.join(OUT, 'verify.txt'), log.join('\n'), 'utf8');
  process.exitCode = 1;
});
