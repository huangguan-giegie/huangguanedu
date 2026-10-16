/* 逐面核对方：把 08T 定义里的关键面在线上实测一遍，跟预期值逐条对。
   用法：node scripts/probe-prod-surfaces.cjs
*/
const { chromium } = require('playwright');

const BASE = process.env.PROD_BASE || 'https://academy.huangguanedu.cn';
const ACCOUNT = { phone: '13900000099', password: 'QaTest@2026' };

/* 期望值来自 src/app/theme-08t.css */
const EXPECT = [
  ['body 底色',            'body',                          'backgroundColor', 'rgb(250, 246, 238)'],
  ['侧栏面',               '.app-sidebar',                  'backgroundColor', 'rgb(255, 253, 248)'],
  ['侧栏描边',             '.app-sidebar',                  'borderTopColor',  'rgb(231, 220, 198)'],
  ['侧栏模糊',             '.app-sidebar',                  'backdropFilter',  'none'],
  ['选中态底（保留紫调）',  '.app-sidebar a[aria-current], .app-sidebar [data-active], .app-sidebar .active', 'backgroundColor', 'rgb(242, 236, 251)'],
  ['h1 字体',              'h1, h2, h3',                    'fontFamily',      'WenKai'],
];

const KEYS = ['backgroundColor', 'borderTopColor', 'backdropFilter', 'fontFamily', 'color'];

(async () => {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(ACCOUNT),
  });
  if (r.status !== 200) throw new Error('登录失败 ' + r.status);
  const jar = (r.headers.getSetCookie?.() ?? []).map((c) => {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(),
             domain: new URL(BASE).hostname, path: '/', sameSite: 'Lax',
             httpOnly: /HttpOnly/i.test(c), secure: /;\s*Secure/i.test(c) };
  });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(jar);
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(700);

  const dump = await page.evaluate((keys) => {
    const grab = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = { __sel: sel, __tag: el.tagName.toLowerCase(), __cls: String(el.className).slice(0, 60) };
      for (const k of keys) o[k] = cs[k];
      const rr = el.getBoundingClientRect();
      o.__box = `${Math.round(rr.width)}x${Math.round(rr.height)}`;
      return o;
    };
    return {
      body: grab('body'),
      sidebar: grab('.app-sidebar'),
      h1: grab('h1, h2, h3'),
      card: grab('.study-note, main .rounded-2xl, .app-content > * > div'),
      navActive: grab('.app-sidebar a[aria-current], .app-sidebar .active, .app-sidebar [data-active="true"]'),
      blurred: [...document.querySelectorAll('*')].filter((el) => {
        const v = getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter;
        return v && v !== 'none';
      }).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40)),
      cssVars: (() => {
        const cs = getComputedStyle(document.documentElement);
        const pick = ['--paper', '--paper-raised', '--paper-line', '--violet', '--foreground', '--muted', '--acid', '--coral'];
        return Object.fromEntries(pick.map((k) => [k, cs.getPropertyValue(k).trim()]));
      })(),
    };
  }, KEYS);

  console.log('=== 关键面实测（' + BASE + '） ===');
  for (const [name, sel, prop, want] of EXPECT) {
    const key = sel === 'body' ? 'body'
      : sel === '.app-sidebar' && prop === 'backgroundColor' ? 'sidebar'
      : sel === '.app-sidebar' && prop === 'borderTopColor' ? 'sidebar'
      : sel === '.app-sidebar' ? 'sidebar'
      : sel.startsWith('h1') ? 'h1'
      : 'navActive';
    const got = dump[key] ? dump[key][prop] : null;
    const ok = got == null ? false : String(got).includes(want);
    console.log(`${ok ? '  OK  ' : '  ??  '} ${name.padEnd(20)} 期望含 ${want.padEnd(22)} 实测 ${got}`);
  }

  console.log('\n=== 08T CSS 变量是否生效 ===');
  console.log(JSON.stringify(dump.cssVars, null, 1));

  console.log('\n=== 侧栏元素类名（便于核对选中态选择器） ===');
  console.log('  ' + JSON.stringify(dump.sidebar && dump.sidebar.__cls));

  console.log('\n=== 逐个面 ===');
  for (const k of ['body', 'sidebar', 'h1', 'card', 'navActive']) {
    const d = dump[k];
    if (!d) { console.log(`  ${k}: 未命中`); continue; }
    console.log(`  ${k.padEnd(10)} ${String(d.__tag).padEnd(6)} ${String(d.__box).padEnd(10)} bg=${d.backgroundColor}  font=${String(d.fontFamily).slice(0, 34)}`);
  }
  console.log(`\n  模糊元素 ${dump.blurred.length} 个 ${dump.blurred.length ? JSON.stringify(dump.blurred.slice(0, 4)) : ''}`);

  await browser.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
