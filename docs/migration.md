# 数据库迁移与回滚说明

## 迁移策略

- 正式库使用 PostgreSQL（RDS），迁移目录 `prisma/migrations/` 为 PostgreSQL 方言。
- 旧的 SQLite 迁移保留在 `prisma/migrations-sqlite/`，仅供历史参考，不部署到 RDS。
- 开发/测试环境与生产使用同一套 PostgreSQL 迁移，避免方言漂移。

## 生成 PostgreSQL 基线

首次初始化（空库）：

```bash
npx.cmd prisma migrate diff --from-empty --to-schema prisma\schema.prisma --script -o prisma\migrations\<timestamp>_init\migration.sql
npx.cmd prisma migrate deploy
```

## 日常开发

```bash
# 修改 schema 后生成并应用增量迁移（开发库）
npm.cmd run db:migrate

# 生产应用待部署迁移
npm.cmd run db:deploy
```

## 回滚

Prisma Migrate 不提供自动 down 迁移。回滚步骤：

1. 用备份恢复数据库到上一个发布版本（推荐，见 `docs/backup-restore.md`）。
2. 若仅需撤销最近一次迁移：
   - 手工执行该迁移 SQL 的逆操作（需先编写并测试逆向 SQL）；
   - 删除 `_prisma_migrations` 中对应记录需谨慎，仅在确认数据库结构已还原后操作。
3. 回滚后重新部署上一版本镜像，并验证数据一致性。

> 建议：每次发版前在预发环境执行 `db:deploy`，确认迁移幂等且不阻塞。

## 旧 SQLite 数据迁移（可选）

```bash
# 需要旧的 dev.db（或指定 SQLITE_DEV_DB 路径）与目标 PostgreSQL DATABASE_URL
npm.cmd run migrate:sqlite-data
```

迁移内容：

- `MonthlyReport` → `LearningSummary`（type=MONTHLY，periodStart/periodEnd 由 month 推导，状态/统计/AI 建议保留）
- `PracticeSet` + `PracticeQuestion` → 独立练习模块（按学生归属重建，summaryId 溯源）

说明：

- 学生按“旧家庭账号手机号 → PostgreSQL 用户 → 家庭账户 → 学生”匹配，未匹配的数据跳过并打印日志。
- 重复执行幂等：已存在同周期总结时自动跳过。
- 演示账号/密码不做迁移；生产库不执行 seed。
