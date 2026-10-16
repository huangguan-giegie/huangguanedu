/* 诊断：用 runas 降权 + cmd 包装启动 postgres，把它的真实 stderr 落盘
   （pg_ctl 会把 postgres 的报错吞成日志里一句"拒绝访问。"，直接跑才看得见原因）
   node scripts/probe-pg-runas.cjs */
const { spawnSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync, rmSync } = require('fs');
const net = require('net');
const { join } = require('path');
const { homedir } = require('os');

const BIN = join(homedir(), '.pg0', 'installation', '18.1.0', 'bin');
const BASE = join(process.env.LOCALAPPDATA, 'yy-local-pg');
const DATA_DIR = join(BASE, 'data');
const OUT = join(BASE, 'direct-postgres.log');

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// 和已有实例一模一样的起法：cmd /C ""postgres.exe" <args> >> log 2>&1"
rmSync(OUT, { force: true });
const inner = `""${join(BIN, 'postgres.exe')}" -D "${DATA_DIR}" -p 55432 -h 127.0.0.1 -c logging_collector=off >> "${OUT}" 2>&1"`;
const cmdline = `cmd.exe /C ${inner}`;

console.log('runas 命令行：\n  ' + cmdline + '\n');
const r = run('runas.exe', ['/trustlevel:0x20000', cmdline]);
console.log('runas: status=' + r.status + ' err=' + (r.error ? r.error.code : '-'));
console.log('runas stdout=' + JSON.stringify((r.stdout || '').trim()));
console.log('runas stderr=' + JSON.stringify((r.stderr || '').trim()));

// 等端口
const deadline = Date.now() + 8000;
const probe = () => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: 55432 });
  s.setTimeout(800);
  s.once('connect', () => { s.destroy(); res(true); });
  s.once('error', () => { s.destroy(); res(false); });
  s.once('timeout', () => { s.destroy(); res(false); });
});

(async () => {
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await probe();
    if (!up) await new Promise((x) => setTimeout(x, 500));
  }
  console.log('\n端口 55432 可连 =', up);

  if (existsSync(OUT)) {
    const raw = readFileSync(OUT);
    // PG 在中文 Windows 下用系统 locale 输出，可能是 GBK；先按 utf8 打，乱码就看 hex
    console.log('\n---- postgres 输出（utf8 视角）----');
    console.log(raw.toString('utf8').slice(0, 3000));
    console.log('\n---- hex 前 240 字节 ----');
    console.log(raw.slice(0, 240).toString('hex'));
  } else {
    console.log('\n(没有产生输出文件 —— runas 那一层就失败了)');
  }
})();
