/* 诊断：能否用 pg_basebackup 从已运行的 5432 实例克隆出一个独立的集群
   （initdb 在本机崩溃，但 pg_basebackup 走的是另一条代码路径）
   node scripts/probe-basebackup.cjs */
const { spawnSync } = require('child_process');
const { existsSync, mkdirSync, rmSync, readdirSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const BIN = join(homedir(), '.pg0', 'installation', '18.1.0', 'bin');
const DEST = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'yy-local-pg', 'clone-data');

const out = [];
if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

const r = spawnSync(
  join(BIN, 'pg_basebackup.exe'),
  ['-h', '127.0.0.1', '-p', '5432', '-U', 'hindsight', '-D', DEST, '-X', 'stream', '-c', 'fast'],
  { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'hindsight' } },
);
out.push('status=' + r.status);
if (r.error) out.push('error=' + (r.error.stack || r.error.message));
out.push('stdout=' + JSON.stringify((r.stdout || '').trim().slice(0, 500)));
out.push('stderr=' + JSON.stringify((r.stderr || '').trim().slice(0, 500)));
out.push('PG_VERSION_exists=' + existsSync(join(DEST, 'PG_VERSION')));
out.push('file_count=' + (existsSync(DEST) ? readdirSync(DEST).length : 0));

console.log(out.join('\n'));
