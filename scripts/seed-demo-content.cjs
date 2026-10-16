/* 造一批演示数据，走应用自己的真实接口（不是直接 INSERT），
   这样 /wrong-questions、/teacher/review 等页面才有内容可看，
   08T 皮肤在"有数据的表格/卡片"上的表现也才能被验证。

   流程：
     1) 用 Playwright 把几道题渲染成 PNG（当"作业照片"）
     2) 以 FAMILY 账号登录，走 POST /api/v1/wrong-questions 上传（multipart + CSRF）
     3) 跑项目自带的分析 worker（QWEN_MODE=mock，本地模拟识别）把错题分析出来

   用法：node scripts/seed-demo-content.cjs [数量]
*/
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:3000';
const PHONE = '13800000003';
const PASSWORD = 'Temp@123456';
const COUNT = Number(process.argv[2] || 6);

const STDIO = ['ignore', 'pipe', 'pipe'];
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', stdio: STDIO, ...opts });

// ── 候选题目（初二数学 + 英语）────────────────────────────────────────────
const MATH = [
  { q: '解方程：3(x - 2) + 5 = 2x + 9', a: 'x = 10', wrong: '移项时把 +5 写成 -5，得到 x = 4' },
  { q: '已知 a + b = 7，ab = 12，求 a² + b² 的值。', a: '25', wrong: '直接用 (a+b)² = a² + b²，漏了 -2ab' },
  { q: '化简：(2x - 3)(x + 4)', a: '2x² + 5x - 12', wrong: '中间项算成 8x - 3x = 5x 写成了 11x' },
  { q: '一次函数 y = -2x + 6 与 x 轴交点的坐标是？', a: '(3, 0)', wrong: '把 -2x + 6 = 0 解成 x = -3' },
  { q: '在 △ABC 中，∠A = 50°，∠B = 60°，求 ∠C。', a: '70°', wrong: '只算了 180 - 50 = 130' },
];
const ENGLISH = [
  { q: 'Choose the correct form:\nShe ______ (go) to school by bike every day.', a: 'goes', wrong: '写成 go，第三人称单数没加 -s' },
  { q: 'Fill in the blank:\nI have lived here ______ 2019.', a: 'since', wrong: '写成 for，since 接时间点、for 接时间段' },
];

function htmlFor(item, index, subject) {
  const isMath = subject === 'MATH';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; width:900px; height:620px; background:#fdfcf7; font-family:"Times New Roman", serif;
           padding:56px 64px; box-sizing:border-box; color:#1f2430; }
    .head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #2f3640; padding-bottom:10px; }
    .head b { font-size:22px; letter-spacing:2px; }
    .head span { font-size:15px; color:#5a616e; }
    .no { margin-top:26px; font-size:17px; color:#5a616e; }
    .q { margin-top:14px; font-size:${isMath ? 30 : 24}px; line-height:1.75; white-space:pre-wrap; }
    .rule { margin-top:30px; height:1px; background:#c9cdd6; }
    .ans { margin-top:24px; font-size:26px; }
    .ans u { text-decoration-thickness:2px; }
    .mark { position:absolute; }
    .tick { display:inline-block; width:38px; height:38px; border-radius:50%; background:#e8f5e9;
            border:2px solid #4caf50; color:#2e7d32; font-size:30px; line-height:36px; text-align:center; }
    .cross { display:inline-block; width:38px; height:38px; border-radius:50%; background:#fdecea;
             border:2px solid #e53935; color:#c62828; font-size:28px; line-height:36px; text-align:center; }
  </style></head><body>
    <div class="head"><b>${isMath ? '数学作业 · 第 8 讲' : '英语作业 · Unit 5'}</b><span>初二（3）班　日期 2026-10-13</span></div>
    <div class="no">第 ${index + 1} 题</div>
    <div class="q">${item.q.replace(/</g, '&lt;')}</div>
    <div class="rule"></div>
    <div class="ans">学生作答：<u>${item.wrong.replace(/</g, '&lt;')}</u>
      <span style="float:right">${index % 3 === 0 ? '<span class="tick">✓</span>' : '<span class="cross">✗</span>'}</span>
    </div>
  </body></html>`;
}

async function makeImages(browser, items, subject) {
  const out = [];
  for (const [i, item] of items.entries()) {
    const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
    await page.setContent(htmlFor(item, i, subject), { waitUntil: 'load' });
    out.push(await page.screenshot({ type: 'png' }));
    await page.close();
  }
  return out;
}

// ── 极简 cookie jar ──────────────────────────────────────────────────────
function makeJar() {
  const jar = new Map();
  return {
    apply(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    get(name) { return jar.get(name); },
  };
}

(async () => {
  console.log('启动浏览器渲染题目图片…');
  const browser = await chromium.launch();
  const images = [
    ...(await makeImages(browser, MATH, 'MATH')).map((buf) => ({ subject: 'MATH', buf })),
    ...(await makeImages(browser, ENGLISH, 'ENGLISH')).map((buf) => ({ subject: 'ENGLISH', buf })),
  ];
  await browser.close();
  console.log(`  生成 ${images.length} 张题目图片`);

  // ── 登录 ──────────────────────────────────────────────────────────────
  const jar = makeJar();
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  });
  jar.apply(login);
  const loginBody = await login.json();
  console.log(`登录 ${PHONE} -> ${login.status} ${loginBody?.data?.user?.name ?? loginBody?.error?.code ?? ''}`);
  if (login.status !== 200) { console.error('登录失败，终止'); process.exit(1); }

  const csrf = jar.get('yy_csrf');
  const created = [];
  for (const [i, { subject, buf }] of images.slice(0, COUNT).entries()) {
    const form = new FormData();
    form.set('subject', subject);
    form.set('image', new Blob([buf], { type: 'image/png' }), `hw-${i + 1}.png`);
    const res = await fetch(`${BASE}/api/v1/wrong-questions`, {
      method: 'POST',
      headers: { cookie: jar.header(), origin: BASE, 'x-csrf-token': csrf },
      body: form,
    });
    jar.apply(res);
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 && body.success) {
      created.push(body.data.wrongQuestionId);
      console.log(`  ✓ 上传 ${subject} #${i + 1} -> ${body.data.wrongQuestionId}`);
    } else {
      console.log(`  ✗ 上传 ${subject} #${i + 1} 失败 ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
  }
  console.log(`\n共创建 ${created.length} 道错题（状态 PROCESSING）`);

  // ── 跑分析 worker（QWEN_MODE=mock）─────────────────────────────────────
  console.log('\n运行分析 worker（npm run analysis:process）…');
  const proc = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'analysis:process'], {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
  });
  console.log((proc.stdout || '').trim().split('\n').slice(-6).join('\n'));
  if (proc.stderr) console.log('  stderr: ' + (proc.stderr || '').trim().slice(0, 600));
})();
