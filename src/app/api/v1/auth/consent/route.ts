// POST /api/v1/auth/consent：监护人隐私同意记录
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireUser } from "../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request, prisma);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const version =
    typeof body?.version === "string" ? body.version.trim() : "";
  if (!version) {
    return jsonError(400, "INVALID_INPUT", "同意版本号不能为空");
  }

  const consent = await prisma.guardianConsent.create({
    data: {
      userId: auth.user.id,
      version,
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return NextResponse.json({ success: true, data: { consent } });
}
