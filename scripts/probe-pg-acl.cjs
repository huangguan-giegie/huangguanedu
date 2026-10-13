/* 诊断第二部分：区分「进程创建被拒」和「PG 自己拒绝」
   A) runas 降权下能不能执行 postgres.exe --version（不涉及数据目录）
   B) 数据目录 / bin 目录的 ACL 长什么样
   node scripts/probe-pg-acl.cjs */
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const BIN = join(homedir(), '.pg0', 'installation', '18.1.0', 'bin');
const BASE = join(process.env.LOCALAPPDATA, 'yy-local-pg');
const DATA_DIR = join(BASE, 'data');
const run = (c, a) => spawnSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// ── A. runas 下执行 --version ──────────────────────────────────────────────
for (const [label, exe, args] of [
  ['cmd 里跑 postgres --version', join(BIN, 'postgres.exe'), ['--version']],
  ['cmd 里跑 initdb --version', join(BIN, 'initdb.exe'), ['--version']],
  ['cmd 里跑 node --version', process.execPath, ['--version']],
]) {
  const out = join(BASE, `probe-${label.replace(/[^\w]/g, '_')}.txt`);
  rmSync(out, { force: true });
  const inner = `""${exe}" ${args.join(' ')} >> "${out}" 2>&1"`;
  const r = run('runas.exe', ['/trustlevel:0x20000', `cmd.exe /C ${inner}`]);
  // 给 runas 的子进程一点时间落盘
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900);
  let content = '(无输出文件)';
  if (existsSync(out)) content = JSON.stringify(readFileSync(out, 'utf8').trim().slice(0, 200));
  console.log(`[${label}] runas_status=${r.status} → ${content}`);
}

// ── B. 不降权、直接跑 postgres --version（对照组）────────────────────────
const v = run(join(BIN, 'postgres.exe'), ['--version']);
console.log('[直接(提权) postgres --version] status=' + v.status + ' → ' + JSON.stringify((v.stdout || '').trim()));

// ── C. ACL ────────────────────────────────────────────────────────────────
for (const p of [join(BIN, 'postgres.exe'), DATA_DIR, BASE]) {
  const r = run('icacls.exe', [p]);
  if (r.status !== 0) { console.log(`[ACL] ${p} → 查询失败 status=${r.status} ${(r.stderr || '').trim()}`); continue; }
  const lines = (r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  console.log(`[ACL] ${p}`);
  for (const l of lines.slice(1, 6)) console.log('       ' + l);
}
