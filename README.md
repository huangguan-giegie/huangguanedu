# 黄冠AI Academy

黄冠AI Academy 是一个面向中小学生的 AI 错题分析平台，支持错题拍照识别、智能分析、周末一对一课程预约、学习总结（周报/月报/学期总结）与练习模块。本仓库实现 MVP 并完成生产化改造（PostgreSQL + OSS + ECS/Nginx 部署）。

## 技术栈

- [Next.js](https://nextjs.org/)（App Router）+ TypeScript
- Tailwind CSS（米白背景、深墨蓝文字、暖橙强调色）
- Prisma 7 + PostgreSQL（本地 Docker / 测试 / 生产 RDS 统一使用）
- Vitest（单元测试）+ Playwright（E2E 测试）
- 阿里云 OSS（私有 Bucket 存储 + 短期签名 URL）
- Qwen 视觉/文本模型（开发默认 Mock，生产 Live）

## 环境要求

- Node.js v22 及以上（当前开发环境为 v22.22.2）
- Docker（本地 PostgreSQL；测试可用嵌入式 PostgreSQL 自动启动）
- PowerShell 下请使用 `npm.cmd` / `npx.cmd` 调用命令（当前执行策略禁止 `npm.ps1`）

## 本地启动

```bash
# 1. 安装依赖
npm.cmd install

# 2. 启动本地 PostgreSQL（Docker）并创建数据库
Copy-Item .env.example .env
npm.cmd run db:up

# 3. 应用迁移并写入演示数据（仅开发环境）
npm.cmd run db:migrate
npm.cmd run db:seed

# 4. 启动开发服务器
npm.cmd run dev
```

访问 `http://localhost:3000`。

> 没有 Docker 时，`npm run test` / `npm run test:e2e` 会自动启动嵌入式 PostgreSQL（Windows x64 二进制，端口 55432），无需额外安装。

## 环境变量说明

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串，本地/测试/生产统一 |
| `APP_BASE_URL` | 生产必填 | 外部可访问的应用地址，Qwen live 模式据此生成可回调的图片 URL |
| `SESSION_SECRET` | 生产必填 | 保留用于未来签名/加密场景；生产校验强制要求配置 |
| `CRON_SECRET` | 生产必填 | 内部清理接口的调用密钥 |
| `STORAGE_PROVIDER` | 生产必填 | `local`（开发）或 `oss`（阿里云 OSS 私有 Bucket） |
| `OSS_ENDPOINT/OSS_REGION/OSS_BUCKET` | oss 必填 | OSS 接入信息 |
| `OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET` | oss 必填 | AccessKey，严禁进入前端、数据库或日志 |
| `OSS_URL_EXPIRES_SECONDS` | 否 | 签名 URL 有效期（秒），默认 300 |
| `TRUSTED_PROXY` | 生产必填 | 仅当 Nginx/负载均衡覆盖代理头时设为 `true` |
| `TRUSTED_PROXY_HOPS` | 否 | 可信代理层数，默认 1 |
| `QWEN_MODE` | 生产必填 | `mock`（默认）或 `live`；生产必须 `live` |
| `DASHSCOPE_API_KEY` | live 必填 | 阿里云百炼 API Key |
| `DASHSCOPE_BASE_URL` | live 必填 | DashScope OpenAI 兼容接口地址（北京地域默认值已内置） |
| `DASHSCOPE_MODEL` | 否 | Qwen 模型，默认 `qwen3.7-plus` |
| `QWEN_*` | 否 | 图片像素、超时、重试、思考模式等 |
| `NEXT_PUBLIC_APP_NAME` | 否 | 应用名称，默认 `黄冠AI Academy` |

> 生产环境（`NODE_ENV=production`）启动时执行严格配置校验，缺少必要变量直接报错，不会静默回退 Mock/本地存储。

## 数据库（Prisma + PostgreSQL）

所有数据模型定义在 `prisma/schema.prisma`，PostgreSQL 基线迁移在 `prisma/migrations/`（旧的 SQLite 迁移保留在 `prisma/migrations-sqlite/` 供参考）。

```bash
# 创建并应用新迁移（开发时修改 schema 后执行）
npm.cmd run db:migrate

# 生产应用迁移（不写入种子数据）
npm.cmd run db:deploy

# 写入演示种子数据（仅开发环境）
npm.cmd run db:seed

# 校验 schema
npx.cmd prisma validate

# 旧 SQLite dev.db 数据迁移（月报/练习数据 → PostgreSQL，可选）
npm.cmd run migrate:sqlite-data
```

### 演示账号（虚构资料）

| 角色 | 手机号 | 姓名 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `13800000001` | 系统管理员 | 可管理账户、课程、审核 |
| 老师 | `13800000002` | 黄冠 | 中国石油大学数学本科、Monash AI 硕士 |
| 家庭 | `13800000003` | 演示家长 | 绑定虚构学生“演示学生 A” |

所有演示账号临时密码均为 `Temp@123456`，首次登录强制修改。

## 学习总结

- 支持周报（周一至周日）、月报（自然月）、学期总结（管理员配置 AcademicTerm）。
- 每名学生、每种类型、每个统计周期最多一份，重复生成幂等复用。
- 每日定时任务自动检查已结束周期并生成草稿；AI 建议失败时保留统计并标记待重试，不自动发布。
- 老师审核通过后才能发布给家庭账户；家庭只能看已发布总结。
- 练习/模拟题组为独立模块（`/api/v1/practice-sets`），不再嵌入总结响应。
- 旧 `/api/v1/reports` 保留为兼容别名，映射到 `type=MONTHLY`。

## 定时任务（生产 jobs 容器）

```bash
# 分析任务：每分钟处理待分析错题
npm.cmd run analysis:process

# 学习总结生成/重试：每日检查已结束周期
npm.cmd run summary:process

# 数据清理：每日执行（过期原图、失败任务、7 天未反馈自动转复核）
npm.cmd run data:cleanup

# 一体化调度器（ECS jobs 容器默认入口）
npm.cmd run scheduler
```

## 测试命令

```bash
# ESLint 检查
npm.cmd run lint

# Vitest 单元测试（自动启动嵌入式 PostgreSQL）
npm.cmd run test

# Playwright E2E 测试（首次运行前执行 npx.cmd playwright install chromium）
npm.cmd run test:e2e

# 生产构建（含 TypeScript 类型检查）
npm.cmd run build
```

## 目录结构

```text
src/
  app/api/v1/    # /api/v1 REST 接口（App Router 路由）
  components/    # UI 组件
  lib/           # 服务端逻辑（配置、存储、总结、错题分析等）
  generated/     # Prisma Client 生成代码（不手工修改）
prisma/
  schema.prisma  # 数据模型
  migrations/    # PostgreSQL 迁移
  migrations-sqlite/ # 旧 SQLite 迁移（仅参考）
  seed.ts        # 演示种子数据（仅开发）
e2e/             # Playwright E2E 测试
scripts/         # 分析/总结/清理/调度/旧数据迁移脚本
nginx/           # 生产 Nginx 配置模板
```

## 相关文档

- `PLAN.md`：生产化与学习总结升级计划
- `docs/api.md`、`docs/openapi.yaml`：API 文档与 OpenAPI 规范
- `docs/data-model.md`、`docs/permissions.md`：数据模型与权限说明
- `docs/deployment.md`：ECS/RDS/OSS/Nginx 部署手册
- `docs/migration.md`：数据库迁移与回滚说明
- `docs/backup-restore.md`：RDS 备份与恢复演练
