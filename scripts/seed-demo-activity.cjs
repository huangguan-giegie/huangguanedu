/* 演示数据第二段：练习集 + 学习总结。
   练习集＝从已确认的错题自动出题；学习总结＝周报/月报草稿并发布。
   都走应用自己的接口，保证走的是真实代码路径。

   前置：先跑过 node scripts/seed-demo-content.cjs
       和 node scripts/enrich-demo-content.cjs

   用法：node scripts/seed-demo-activity.cjs
*/
const { Client } = require('pg');

const BASE = process.env.APP_BASE || 'http://127.0.0.1:3000';
const DB_URL = process.env.DATABASE_URL
  || 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu';

const ACCOUNTS = {
  FAMILY: { phone: '13800000003', password: 'Temp@123456' },
  TEACHER: { phone: '13800000002', password: 'Temp@123456' },
  ADMIN: { phone: '13800000001', password: 'Temp@123456' },
};

function makeJar() {
  const jar = new Map();
  return {
    apply(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
    get(n) { return jar.get(n); },
  };
}

async function login(role) {
  const jar = makeJar();
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  jar.apply(res);
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) throw new Error(`${role} 登录失败 ${res.status} ${JSON.stringify(body)}`);
  return { jar, user: body.data.user };
}

/** 统一的 POST 小工具：自动带 cookie / origin / csrf */
async function post(session, path, json) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      cookie: session.jar.header(),
      origin: BASE,
      'x-csrf-token': session.jar.get('yy_csrf'),
      'content-type': 'application/json',
    },
    body: JSON.stringify(json),
  });
  session.jar.apply(res);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** 同上的 PATCH 版（审核走 PATCH） */
async function patch(session, path, json) {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: {
      cookie: session.jar.header(),
      origin: BASE,
      'x-csrf-token': session.jar.get('yy_csrf'),
      'content-type': 'application/json',
    },
    body: JSON.stringify(json),
  });
  session.jar.apply(res);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const student = (await db.query(
    'select s.id, s.name from "Student" s order by s."createdAt" limit 1',
  )).rows[0];
  if (!student) { console.error('库里没有学生，先跑 seed'); process.exit(1); }
  console.log(`学生：${student.name} (${student.id})`);

  // ── 1. 练习集（FAMILY 从已确认的数学错题出题）──────────────────────────
  const family = await login('FAMILY');
  console.log(`登录 FAMILY -> ${family.user.name}`);

  const mathIds = (await db.query(
    `select id from "WrongQuestion"
     where "studentId" = $1 and subject = 'MATH' and status in ('PUBLISHED','REVIEWED')
       and "deletedAt" is null and "recognizedQuestion" is not null
     order by "createdAt" limit 3`,
    [student.id],
  )).rows.map((r) => r.id);

  if (mathIds.length === 0) {
    console.log('没有可用于出题的数学错题，跳过练习集');
  } else {
    const gen = await post(family, '/api/v1/practice-sets/generate', {
      wrongQuestionIds: mathIds, difficulty: 'MEDIUM',
    });
    console.log(`生成练习集 -> ${gen.status} ${JSON.stringify(gen.body).slice(0, 220)}`);
  }

  // ── 2. 学习总结（TEACHER 出周报 + 月报）────────────────────────────────
  const teacher = await login('TEACHER');
  console.log(`\n登录 TEACHER -> ${teacher.user.name}`);

  for (const payload of [
    { type: 'WEEKLY' },
    { type: 'MONTHLY', month: '2026-10' },
  ]) {
    const r = await post(teacher, '/api/v1/summaries/generate', { studentId: student.id, ...payload });
    console.log(`生成 ${payload.type} 总结 -> ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
  }

  // ── 3. 等练习生成任务落地（after() 里异步跑）──────────────────────────
  for (let i = 0; i < 20; i++) {
    const n = (await db.query('select count(*)::int n from "PracticeSet"')).rows[0].n;
    if (n > 0) break;
    await sleep(1500);
  }

  // ── 4. 审核并发布一份总结，让家长端 /reports 有已发布内容 ───────────────
  const draft = (await db.query(
    `select id, type, status from "LearningSummary"
     where "studentId" = $1 and status <> 'PUBLISHED' order by "createdAt" limit 1`,
    [student.id],
  )).rows[0];
  if (draft) {
    const rev = await patch(teacher, `/api/v1/summaries/${draft.id}/review`, {});
    console.log(`\n审核总结 ${draft.type} -> ${rev.status} ${JSON.stringify(rev.body).slice(0, 200)}`);
    const pub = await post(teacher, `/api/v1/summaries/${draft.id}/publish`, {});
    console.log(`发布总结 ${draft.type} -> ${pub.status} ${JSON.stringify(pub.body).slice(0, 200)}`);
  }

  // ── 5. 汇总 ───────────────────────────────────────────────────────────
  console.log('\n当前数据量：');
  for (const t of ['WrongQuestion', 'WrongQuestionKnowledgePoint', 'PracticeSet', 'PracticeQuestion',
                   'LearningSummary', 'CourseSlot', 'Booking', 'StudentEntitlement', 'TeacherStudentAssignment']) {
    const n = (await db.query(`select count(*)::int n from "${t}"`)).rows[0].n;
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }
  await db.end();
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
