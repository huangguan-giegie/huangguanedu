/* 诊断：08T 皮肤上线后，globals.css 与 theme-08t.css 的真实生效情况
   不靠 grep 猜 CSS 文本，直接读浏览器 computed style。 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const reqs = [];
  p.on('response', r => { if (r.url().endsWith('.css')) reqs.push(r.url().split('/').pop().slice(0, 46) + '  ' + r.status()); });
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  const r = await p.evaluate(() => {
    const get = (sel, props) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, found: false };
      const cs = getComputedStyle(el);
      const o = { sel, found: true };
      props.forEach(pr => o[pr] = cs[pr]);
      return o;
    };
    return {
      sheets: [...document.styleSheets].map(s => {
        let n = 0, sample = [];
        try {
          n = s.cssRules.length;
          for (let i = 0; i < Math.min(n, 400); i++) {
            const sel = s.cssRules[i].selectorText;
            if (sel && /auth-page|app-shell|logout-button/.test(sel)) sample.push(sel.slice(0, 40));
          }
        } catch (e) { n = 'blocked'; }
        return { file: (s.href || 'inline').split('/').pop().slice(0, 44), rules: n, found: sample };
      }),
      authPage: get('.auth-page', ['display', 'gridTemplateColumns', 'minHeight', 'padding']),
      appShell: get('.app-shell', ['display', 'gridTemplateColumns']),
      body: get('body', ['backgroundColor', 'fontFamily']),
      authCard: get('.auth-card', ['backgroundColor', 'borderTopWidth', 'borderRadius']),
      sidebar: get('.app-sidebar', ['backgroundColor', 'borderColor', 'backdropFilter']),
      input: get('input', ['minHeight', 'borderRadius']),
      heading: get('h1, h2', ['fontFamily', 'fontWeight'])
    };
  });

  console.log('=== CSS 网络请求 ===');
  reqs.forEach(x => console.log('  ' + x));
  console.log('\n=== 样式表与命中的选择器 ===');
  console.log(JSON.stringify(r.sheets, null, 1));
  console.log('\n=== computed style 实测 ===');
  ['authPage', 'appShell', 'body', 'authCard', 'sidebar', 'input', 'heading'].forEach(k => {
    console.log('  ' + k + ': ' + JSON.stringify(r[k]));
  });
  await b.close();
})();
