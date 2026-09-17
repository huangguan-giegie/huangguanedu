// Vitest 全局准备：启动嵌入式 PostgreSQL（单 worker 复用它），结束测试时停止。
import { getOrStartTestPostgres } from "./test-postgres";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const pg = await getOrStartTestPostgres();
  return async () => {
    pg.stop();
  };
}
