// 内部清理接口：受 CRON_SECRET 保护，生产由外部 cron 每日调用
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { runDataCleanup } from "../../../../../lib/cleanup";
import { loadConfig } from "../../../../../lib/config";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";

export async function POST(request: NextRequest) {
  const config = loadConfig();
  const secret = request.headers.get("x-cron-secret");
  if (!config.cronSecret || secret !== config.cronSecret) {
    return jsonError(401, "UNAUTHORIZED", "清理接口需要有效的 CRON_SECRET");
  }

  const result = await runDataCleanup(prisma);
  return NextResponse.json({ success: true, data: result });
}
