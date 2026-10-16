/* 诊断：直接前台启动 postgres.exe，抓它真正的报错（绕开 pg_ctl 的包装）
   node scripts/probe-pg-direct.cjs */
const { spawn } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const BIN = join(homedir(), '.pg0', 'installation', '18.1.0', 'bin');
const DATA_DIR = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'yy-local-pg', 'data');

console.log('BIN       =', BIN);
console.log('DATA_DIR  =', DATA_DIR);
console.log('PG_VERSION存在 =', existsSync(join(DATA_DIR, 'PG_VERSION')));
console.log('bin/share 存在 =', existsSync(join(BIN, '..', 'share')));

const args = ['-D', DATA_DIR, '-p', '55432', '-h', '127.0.0.1'];
console.log('args =', JSON.stringify(args));

const child = spawn(join(BIN, 'postgres.exe'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
let err = '';
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { err += d.toString(); });

child.on('error', (e) => { console.log('spawn error:', e.code, e.message); });

setTimeout(() => {
  console.log('---- 3 秒后仍在运行？', child.exitCode === null);
  console.log('---- stdout ----');
  console.log(out.trim() || '(空)');
  console.log('---- stderr ----');
  console.log(err.trim() || '(空)');
  if (child.exitCode === null) {
    child.kill();
    console.log('(已终止)');
  } else {
    console.log('exitCode =', child.exitCode, '0x' + (child.exitCode >>> 0).toString(16));
  }
  process.exit(0);
}, 3000);
