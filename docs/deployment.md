# 生产部署手册（阿里云：ECS + RDS + OSS + Nginx）

> 第一阶段部署到中国香港阿里云。本文档说明架构与配置；实际创建资源、填写真实密钥、绑定域名需在域名确定后执行。

## 架构总览

```text
用户 -> DNS/CDN(可选) -> Nginx(ECS, 80/443, HTTPS 终止)
                          -> web 容器 (Next.js, 127.0.0.1:3000)
                          -> jobs 容器 (分析/总结/清理调度)
ECS 内网 -> RDS PostgreSQL（同一地域同一 VPC，白名单仅放行 ECS 内网 IP）
web/jobs -> OSS 私有 Bucket（对象存储，短期签名 URL 读取）
```

## 一、RDS PostgreSQL

1. 与 ECS 同地域（如 cn-hongkong）、同一 VPC 创建 RDS PostgreSQL。
2. 白名单仅允许 ECS 内网 IP 访问；应用使用内网地址连接。
3. 连接串启用 SSL：

```text
DATABASE_URL=postgresql://user:pass@rds-inner-address:5432/huangguanedu?sslmode=require
```

4. 启用自动备份，并定期做手动备份与恢复演练（见 `docs/backup-restore.md`）。
5. 生产不执行 `db:seed`，避免写入演示账户；首次初始化执行 `npm run db:deploy`。

## 二、OSS 私有 Bucket

1. 创建私有读写权限 Bucket（读写均通过服务端凭证）。
2. 配置环境变量：

```text
STORAGE_PROVIDER=oss
OSS_ENDPOINT=https://oss-cn-hongkong.aliyuncs.com
OSS_REGION=cn-hongkong
OSS_BUCKET=huangguanedu-prod
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_URL_EXPIRES_SECONDS=300
```

3. 应用只保存对象 Key；`GET /api/v1/images/:id` 返回 302 短期签名 URL；Qwen 分析使用签名读取地址。
4. AccessKey 严禁进入前端、数据库或日志；建议使用 RAM 子账号并只授予该 Bucket 的读写权限。

## 三、ECS 与 Docker

### 安全组

- 只开放 80/443 给全网。
- SSH（22）仅允许管理员固定 IP。

### 部署步骤

```bash
# 1. 安装 Docker 与 compose 插件（Ubuntu LTS）
sudo apt update && sudo apt install -y docker.io docker-compose-plugin

# 2. 拉取代码并构建
git clone <repo> /opt/huangguanedu && cd /opt/huangguanedu
cp .env.example .env   # 填写生产配置

# 3. 放置证书到 nginx/certs/（阿里云证书或受信任 CA）
#    server.crt / server.key

# 4. 应用数据库迁移（仅首次/发版时）
npm.cmd run db:deploy   # 或 docker compose run --rm web npx prisma migrate deploy

# 5. 启动
docker compose up -d --build
```

### HTTPS 与安全头

- Nginx 监听 80/443，HTTP 自动 301 跳转 HTTPS。
- 已配置 `Strict-Transport-Security`（HSTS）、`X-Content-Type-Options`、`X-Frame-Options`。
- Cookie 在 `NODE_ENV=production` 下自动启用 Secure。

### 可信代理

```text
TRUSTED_PROXY=true
TRUSTED_PROXY_HOPS=1
```

仅当 Nginx 覆盖 `X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto` 时开启；否则 `getClientIp` 返回 `unknown`，登录锁定只按手机号计数，杜绝伪造 IP。

## 四、定时任务（jobs 容器）

`jobs` 容器默认运行 `scripts/scheduler.ts`：

| 任务 | 频率 | 说明 |
| --- | --- | --- |
| 分析任务 | 每分钟 | 处理待分析错题 |
| 学习总结 | 每日 | 检查已结束周/月/学期并生成草稿，重试 AI 失败 |
| 数据清理 | 每日 | 过期原图、失败任务、7 天未反馈自动转复核 |

任务失败写日志并计数，连续失败 5 次退出进程（非零状态），便于监控报警。

## 五、生产必需环境变量

```text
NODE_ENV=production
DATABASE_URL
APP_BASE_URL=https://待定域名
SESSION_SECRET
CRON_SECRET
STORAGE_PROVIDER=oss
OSS_ENDPOINT / OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
QWEN_MODE=live
DASHSCOPE_API_KEY
DASHSCOPE_BASE_URL
DASHSCOPE_MODEL
TRUSTED_PROXY=true
TRUSTED_PROXY_HOPS=1
```

应用启动时严格校验，缺失直接报错。

## 六、上线检查清单

- [ ] 域名已解析到 ECS 公网 IP，HTTPS 证书生效
- [ ] RDS 白名单仅 ECS 内网 IP，SSL 连接
- [ ] 生产数据库迁移已应用，未执行 seed
- [ ] OSS Bucket 私有，签名 URL 有效期 300s
- [ ] 安全组仅 80/443 + SSH 固定 IP
- [ ] jobs 容器运行正常，日志无连续失败
- [ ] 登录、改密、上传错题、总结生成/审核/发布回归通过
