/* 08T 落地效果截图 —— 桌面 + 移动，含登录态页面
   用法：node scripts/shot-08t-rollout.cjs [email] [password]
   不传账号则只截公开页。 */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'C:/Users/huangguan/Desktop/huangguanedu/deliverables/08t-rollout-2026-10-13/';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const email = process.argv[2] || '';
const password = process.argv[3] || '';
const BASE = 'http://localhost:3000';

(async () => {
  const b = await chromium.launch();
  const errs = [];

  async function shoot(w, h, name, path, opts = {}) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    p.on('console', m => { if (m.type() === 'error') errs.push('[' + name + '] ' + m.text()); });
    p.on('pageerror', e => errs.push('[' + name + '] PAGEERROR ' + e.message));
    if (opts.storage) await p.context().addInitScript(() => {});
    await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(opts.wait || 900);
    await p.screenshot({ path: OUT + name + '.png', fullPage: !!opts.full });
    const title = await p.title();
    await p.close();
    return title;
  }

  console.log('登录页        ' + await shoot(1440, 900, 'login-desktop', '/login'));
  console.log('登录页·移动   ' + await shoot(390, 844, 'login-mobile', '/login'));

  if (email && password) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push('[auth] ' + m.text()); });
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    // 本项目登录用手机号（inputMode=tel）+ 密码
    await p.fill('input[inputmode="tel"], input[name="phone"], input[type="tel"]', email).catch(() => {});
    await p.fill('input[type="password"]', password).catch(() => {});
    await p.click('button[type="submit"], .button-primary').catch(() => {});
    await p.waitForTimeout(3000);
    const url = p.url();
    console.log('登录后跳转 -> ' + url);

    for (const [name, path] of [
      ['home-desktop', '/'],
      ['wrong-questions', '/wrong-questions'],
      ['practice', '/practice'],
      ['bookings', '/bookings'],
      ['reports', '/reports'],
      ['account', '/account'],
    ]) {
      await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
      await p.waitForTimeout(1100);
      await p.screenshot({ path: OUT + name + '.png' });
      console.log('  ✓ ' + name);
    }
    // 移动端首页
    const m = await ctx.newPage();
    await m.setViewportSize({ width: 390, height: 844 });
    await m.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
    await m.waitForTimeout(1100);
    await m.screenshot({ path: OUT + 'home-mobile.png' });
    console.log('  ✓ home-mobile');
    await ctx.close();
  }

  console.log('\nconsole 错误: ' + errs.length);
  errs.slice(0, 10).forEach(e => console.log('  ' + e));
  console.log('\n输出目录: ' + OUT);
  await b.close();
})();
