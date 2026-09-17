# 严格安全与生产复核报告

复核对象：`d9cac59`（生产化与学习总结升级）及其后的复核修复提交。
复核方式：静态审查 + 自动化测试（Vitest/Playwright）+ 迁移演练。

## 1. 权限与接口防护

结论：**通过（含修复）**。

- 全量扫描 `/api/v1` 下所有 POST/PATCH/DELETE 路由：除以下豁免外，均要求登录鉴权 + 同源 Origin/CSRF 校验：
  - `/auth/login`：会话建立入口，豁免 Origin/CSRF（代码注释已说明），受登录锁定限制；
  - `/auth/logout`：未登录时幂等返回成功；已登录时仍需 CSRF 校验并清除会话 Cookie；
  - `/internal/cleanup`：外部 cron 专用，受 `CRON_SECRET` 头校验，豁免 CSRF；
  - `/auth/login` 与 `/internal/cleanup` 之外无鉴权的状态变更路由：**无**。
- 数据隔离抽查（均有测试覆盖）：预约取消校验归属；错题/反馈/作答/状态校验学生归属；老师复核/合并校验负责关系；总结生成/审核/发布校验负责关系；家庭端总结仅见已发布；图片访问按角色隔离。
- 修复：`/teacher/students` 原仅允许 TEACHER，与文档矩阵（TEACHER、ADMIN）不一致，已改为 TEACHER/ADMIN 并补充管理员用例。

## 2. 生产配置校验

结论：**通过（含修复）**。

- `NODE_ENV=production` 下强制要求：`DATABASE_URL`、`APP_BASE_URL`、`SESSION_SECRET`、`CRON_SECRET`、`STORAGE_PROVIDER`、`TRUSTED_PROXY`、`QWEN_MODE=live`；
- `QWEN_MODE=live` 强制要求 `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`；`STORAGE_PROVIDER=oss` 强制要求全部 `OSS_*`；
- 缺配置直接抛 `ConfigError`，禁止静默回退 Mock/本地存储；
- 修复：`TRUSTED_PROXY` 此前未纳入生产必填，已加入强制校验并补测试（显式 `true`/`false` 均合法，未设置才报错）；
- 裁决：`SESSION_SECRET` 当前代码未参与签名（会话用数据库随机令牌 + SHA-256），按计划保留为“生产必填的预留项”，README 已说明。

## 3. OSS 存储

结论：**通过（静态审查 + 待真实环境冒烟）**。

- 存储抽象统一：应用只保存对象 Key，不保存公网 URL；读取由 `/api/v1/images/:id` 返回 302 短期签名 URL（默认 300s）；
- Qwen live 模式使用签名读取地址，本地存储回退站内图片路由；
- AccessKey 仅服务端环境变量，不进前端 bundle、数据库或日志；日志仅记模型/耗时/状态/requestId；
- 过期原图清理策略保留（普通 24h / 复核 7 天 / 失败任务与自动转复核均延至 7 天）；
- `ali-oss` 已加入 `serverExternalPackages`，避免 Turbopack 打包 Node SDK；
- 真实 OSS 上传/签名读取/删除将在部署阶段冒烟验证。

## 4. 可信代理

结论：**通过**。

- `getClientIp` 仅在 `TRUSTED_PROXY=true` 时解析 `X-Forwarded-For`，并按 `TRUSTED_PROXY_HOPS` 从右向左取真实客户端地址；未开启时返回 `unknown`，登录锁定只按手机号计数，杜绝伪造 IP；
- Nginx 模板覆盖 `X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto`，HTTP 80 自动跳转 HTTPS，配置 HSTS/防嗅探/防点击劫持头；
- 单元测试覆盖：未开启时不信头、hops=1 取最右、hops=2 跳过两层。

## 5. 数据库迁移

结论：**通过（含修复）**。

- PostgreSQL 基线迁移 `prisma/migrations/20260806000000_init` 已在全新测试库反复应用成功（17 个测试库 + E2E 库）；
- 旧 SQLite 迁移归档至 `prisma/migrations-sqlite/`，仅作参考，不部署；
- 修复：新迁移目录缺少 `migration_lock.toml`（provider=postgresql），会导致 `prisma migrate deploy` 失败，已补齐；
- 生产初始化流程：创建应用库 → `prisma migrate deploy` → 不执行 seed；旧数据迁移使用 `npm run migrate:sqlite-data`（幂等）。

## 6. Docker 与 Nginx 部署

结论：**通过（含修复，镜像构建待真实环境）**。

- Dockerfile 双目标：`web`（Next.js start）+ `jobs`（scheduler），构建阶段 `prisma generate` + `next build`；
- docker-compose：postgres（本地开发）/ web / jobs / nginx，web 仅绑定 127.0.0.1:3000，公网只暴露 80/443；
- 修复：新增 `.dockerignore`（排除 node_modules/.next/.env/storage/日志/密钥等约 914MB 上下文）；
- 新增 `scripts/gen-selfsigned-cert.sh`：无域名阶段生成 Nginx 自签证书占位，拿到正式证书后直接替换；
- 本地无 Docker，镜像构建与 compose 启动将在香港 ECS 上执行并冒烟验证。

## 7. 验证证据

复核修复后的全套验证（执行于本机）：

- `npm run lint`：通过
- `npx prisma validate`：通过
- `npm run test`：17 个文件、118 个测试全部通过（PostgreSQL 嵌入式实例）
- `npm run build`：通过（仅 5 条动态文件系统访问警告，属本地存储方案的已知提示）
- `npm run test:e2e`：2/2 通过（登录→改密→预约→上传→确认识别→查看解答）

## 8. 遗留项（部署阶段处理）

- 真实 OSS 上传/签名读取/删除冒烟；
- RDS 备份与恢复演练；
- Docker 镜像构建与 compose 启动冒烟；
- 域名与正式证书替换自签证书；
- GitHub 远程配置与推送（待仓库地址确定）。
