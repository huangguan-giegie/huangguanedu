// GET /api/v1/auth/me：返回当前登录用户信息
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";

export async function GET(request: NextRequest) {
  const result = await requireUser(request, prisma);
  if ("error" in result) {
    return result.error;
  }

  return NextResponse.json({ success: true, data: { user: result.user } });
}
