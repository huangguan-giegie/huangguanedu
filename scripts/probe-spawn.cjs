/* 诊断用：探测当前 Node 进程能否创建子进程（沙箱/作业对象限制排查）。
   node scripts/probe-spawn.cjs */
const { spawnSync, execFileSync } = require('child_process');
const { join } = require('path');
const { writeFileSync } = require('fs');

const BIN = join(__dirname, '..', 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
const lines = [];
const push = (s) => { lines.push(s); };

push('node=' + process.version);
push('execPath=' + process.execPath);
push('cwd=' + process.cwd());

// 1) spawnSync 基础能力
for (const [name, cmd, args] of [
  ['cmd /c echo', 'C:\\Windows\\System32\\cmd.exe', ['/c', 'echo', 'ok']],
  ['node -e', process.execPath, ['-e', 'console.log(1)']],
  ['initdb --version', join(BIN, 'initdb.exe'), ['--version']],
]) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  push(`spawnSync ${name}: status=${r.status} err=${r.error ? r.error.code : '-'} out=${JSON.stringify((r.stdout || '').trim())}`);
}

// 2) 不同 stdio 组合（看看是不是管道问题）
for (const stdio of ['pipe', 'inherit', 'ignore', [ 'ignore', 'pipe', 'pipe' ]]) {
  const r = spawnSync(join(BIN, 'initdb.exe'), ['--version'], { stdio, encoding: 'utf8' });
  push(`initdb stdio=${JSON.stringify(stdio)}: status=${r.status} err=${r.error ? r.error.code : '-'} out=${JSON.stringify((r.stdout || '').toString().trim())}`);
}

// 3) execFileSync 走另一条 libuv 路径
try {
  const o = execFileSync(join(BIN, 'initdb.exe'), ['--version'], { encoding: 'utf8' });
  push('execFileSync initdb: OK ' + JSON.stringify(o.trim()));
} catch (e) {
  push('execFileSync initdb: FAIL ' + e.code + ' ' + e.message.split('\n')[0]);
}

const text = lines.join('\n');
writeFileSync(join(__dirname, '..', '.probe-spawn-result.txt'), text, 'utf8');
console.log(text);
