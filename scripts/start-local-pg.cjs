/* 确保本地有一个本项目能用的 PostgreSQL，并把它需要的角色/库准备好。
   —— 服务于「本地跑通登录→做题→报告链路」，供 UI 走查截图使用。

   ── 为什么需要这个脚本 ───────────────────────────────────────────────────
   .env 里 DATABASE_URL 指向 SQLite（file:./dev.db），而 src/lib/db.ts 写死
   new PrismaPg({...})，两者不兼容 → 本地任何读写库的接口都 500
   （报 AuthenticationFailed）。而 .env.example 约定的本地库是
       postgresql://127.0.0.1:5432/huangguanedu
   本脚本负责把 5432 上这个角色和库建出来。

   ── 本机踩过的三个坑（都已实测验证，别再重复踩）────────────────────────
   坑 1｜Node 里 spawnSync 的 stdio 不能写字符串 'pipe'
     { stdio: 'pipe' } 等价于 ['pipe','pipe','pipe']，会为子进程 **stdin 建管道**，
     在本机必然抛 `spawnSync ... EBUSY`，且 status/signal/stdout/stderr 全是 null，
     打印出来就是一句无从下手的 "失败：undefined"。
     必须写 ['ignore','pipe','pipe']。
     实测对照：stdio='pipe' → EBUSY；'ignore' → OK；['ignore','pipe','pipe'] → OK 且有输出。
     src/lib/test-postgres.ts 用的正是 stdio:"pipe"，所以它在同一台机器上也起不来。

   坑 2｜不要试图用 initdb 在本机新建集群
     initdb.exe（项目自带的 @embedded-postgres@18.4.0-beta.17、以及本机
     ~/.pg0/installation/18.1.0 的版本，两个都试过）在真正开始初始化时会直接崩：
     exit=0xC0000409、异常模块 ucrtbase.dll、stdout/stderr 全空、数据目录一个文件都不产生。
     Windows 事件日志「应用程序错误」有明确记录。
     （`initdb --version` / `--help` 正常，非常有迷惑性。）
     结论：本机不适合用 initdb 造集群，改用「在已运行的实例上建库」这条路。

   坑 3｜PostgreSQL 服务端拒绝以管理员身份运行，而 agent 的工具正是提权的
     直接跑 postgres.exe 的真实报错是：
       Execution of PostgreSQL by a user with administrative permissions is not
       permitted.
     但 pg_ctl 把它吞成日志里一句"拒绝访问。"，极难猜。
     不要用 `runas /trustlevel:0x20000` 绕过：它产生的受限令牌里
     受限 SID 列表不含本用户，实测连 `node --version` 都会 "拒绝访问。"
     （ACL 只授权给 huangguan / Administrators / CodexSandboxUsers）。
     结论：服务端不要自己起，用机器上已经跑着的那个（或在普通用户终端里起）。

   用法：
     node scripts/start-local-pg.cjs          确保本地库可用（建角色+建库）
     node scripts/start-local-pg.cjs status   查看状态
     node scripts/start-local-pg.cjs probe    列出所有探测到的候选实例
*/
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { Client } = require('pg');

const DB_NAME = process.env.YY_DB_NAME || 'huangguanedu';
const DB_USER = process.env.YY_DB_USER || 'huangguan';
const DB_PASS = process.env.YY_DB_PASS || 'huangguan_dev';
const STDIO = ['ignore', 'pipe', 'pipe'];

/* 候选实例：
   1) YY_PG_ADMIN_URL 环境变量指定的实例
   2) 本机 ~/.pg0/instances 下各 instance.json 里记录的用户名/密码（本机现有的开发实例）
   3) 兜底：最常见的一组本地默认凭据 */
function candidates() {
  const list = [];
  if (process.env.YY_PG_ADMIN_URL) {
    list.push({ label: 'YY_PG_ADMIN_URL', url: process.env.YY_PG_ADMIN_URL });
  }
  const root = join(homedir(), '.pg0', 'instances');
  if (existsSync(root)) {
    for (const name of readdirSync(root)) {
      const f = join(root, name, 'instance.json');
      if (!existsSync(f)) continue;
      try {
        const c = JSON.parse(readFileSync(f, 'utf8'));
        if (!c.port || !c.username) continue;
        list.push({
          label: `${name} @${c.port}（本机已有实例）`,
          url: `postgresql://${encodeURIComponent(c.username)}:${encodeURIComponent(c.password ?? '')}` +
            `@127.0.0.1:${c.port}/${encodeURIComponent(c.database ?? 'postgres')}`,
        });
      } catch { /* 跳过坏配置 */ }
    }
  }
  list.push({ label: '默认本地凭据 postgres/postgres @5432', url: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });
  list.push({ label: '项目 .env.example 约定 @5432', url: `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/postgres` });
  return list;
}

async function tryConnect(url) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    const v = await c.query('select version()');
    const s = await c.query('select rolsuper, rolcreatedb from pg_roles where rolname = current_user');
    return {
      ok: true,
      version: v.rows[0].version.split(',')[0],
      superuser: s.rows[0]?.rolsuper === true,
      createdb: s.rows[0]?.rolcreatedb === true,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function listCandidates() {
  const out = [];
  for (const cand of candidates()) {
    const r = await tryConnect(cand.url);
    out.push({ ...cand, ...r });
  }
  return out;
}

async function main() {
  const mode = process.argv[2] || 'start';

  if (mode === 'probe') {
    for (const c of await listCandidates()) {
      console.log(`${c.ok ? '✓' : '✗'} ${c.label}`);
      console.log(`   ${c.url.replace(/:[^:@/]*@/, ':***@')}`);
      console.log(`   ${c.ok ? `${c.version} superuser=${c.superuser} createdb=${c.createdb}` : c.error}`);
    }
    return;
  }

  const found = (await listCandidates()).filter((c) => c.ok);
  if (found.length === 0) {
    console.error('没有找到可连的本地 PostgreSQL。');
    console.error('请先在普通用户终端里启动一个（或设置 YY_PG_ADMIN_URL=postgresql://user:pass@host:port/db）。');
    process.exit(1);
  }

  const src = found[0];
  const url = new URL(src.url);
  console.log(`使用实例：${src.label}`);
  console.log(`  ${src.version}  superuser=${src.superuser} createdb=${src.createdb}`);

  if (mode === 'status') {
    const admin = new Client({ connectionString: src.url });
    await admin.connect();
    const has = await admin.query('select 1 from pg_database where datname = $1', [DB_NAME]);
    console.log(has.rowCount ? `数据库 ${DB_NAME} 已存在` : `数据库 ${DB_NAME} 不存在`);
    const role = await admin.query('select 1 from pg_roles where rolname = $1', [DB_USER]);
    console.log(role.rowCount ? `角色 ${DB_USER} 已存在` : `角色 ${DB_USER} 不存在`);
    await admin.end();
    return;
  }

  if (!src.superuser && !src.createdb) {
    console.error('当前连接的角色没有建库权限，无法继续。');
    process.exit(1);
  }

  const admin = new Client({ connectionString: src.url });
  await admin.connect();
  try {
    // 角色：让连接串与项目 .env.example 的约定一致（huangguan / huangguan_dev）
    const role = await admin.query('select 1 from pg_roles where rolname = $1', [DB_USER]);
    if (role.rowCount === 0) {
      await admin.query(`CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASS}'`);
      console.log(`已创建角色 ${DB_USER}`);
    } else {
      console.log(`角色 ${DB_USER} 已存在`);
    }

    const db = await admin.query('select 1 from pg_database where datname = $1', [DB_NAME]);
    if (db.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}"`);
      console.log(`已创建数据库 ${DB_NAME}（owner=${DB_USER}）`);
    } else {
      console.log(`数据库 ${DB_NAME} 已存在`);
    }
  } finally {
    await admin.end();
  }

  const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  console.log('\nDATABASE_URL=postgresql://' + DB_USER + ':' + DB_PASS + '@' + host + '/' + DB_NAME);
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
