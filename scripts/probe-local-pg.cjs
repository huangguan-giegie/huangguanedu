/* 探测本地可用的 PostgreSQL 实例（供本地开发/截图使用）
   背景：.env 里的 DATABASE_URL 指向 SQLite，但 src/lib/db.ts 只支持 PrismaPg，
        导致本地 dev 登录接口 500（AuthenticationFailed）。
   本脚本只读探测，不修改任何数据。 */
const { Client } = require('pg');

const CANDIDATES = [
  ['55432 · trust(postgres)', 'postgresql://postgres:postgres@127.0.0.1:55432/postgres'],
  ['55432 · trust(huangguanedu)', 'postgresql://postgres:postgres@127.0.0.1:55432/huangguanedu'],
  ['5432 · postgres/postgres', 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'],
  ['5432 · huangguan/huangguan_dev', 'postgresql://huangguan:huangguan_dev@127.0.0.1:5432/huangguanedu'],
  ['5432 · postgres/postgres@huangguanedu', 'postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu'],
];

(async () => {
  for (const [label, url] of CANDIDATES) {
    const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await c.connect();
      const dbs = await c.query("select datname from pg_database where datistemplate = false order by datname");
      let users = null;
      try {
        const r = await c.query('select count(*)::int n from "User"');
        users = r.rows[0].n;
      } catch { /* 该库没有 User 表 */ }
      console.log('✓ ' + label);
      console.log('    数据库: ' + dbs.rows.map(x => x.datname).join(', '));
      console.log('    User 表记录数: ' + (users === null ? '（无 User 表）' : users));
      await c.end();
    } catch (e) {
      console.log('✗ ' + label + '  → ' + e.message.split('\n')[0].slice(0, 70));
      await c.end().catch(() => {});
    }
  }
})();
