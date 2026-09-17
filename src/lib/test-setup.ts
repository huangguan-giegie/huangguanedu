// Vitest 测试环境准备：把 DATABASE_URL 指向当前测试文件专属的临时 PostgreSQL 数据库，
// 保证路由处理器共享的 Prisma 客户端与测试代码访问同一个数据库。
import { getTestDatabaseUrl } from "./test-db";

// 测试环境模拟“Nginx 可信代理”语义，让带 X-Forwarded-For 的请求按预期解析 IP
process.env.TRUSTED_PROXY = "true";
process.env.TRUSTED_PROXY_HOPS = "1";

process.env.DATABASE_URL = await getTestDatabaseUrl();
