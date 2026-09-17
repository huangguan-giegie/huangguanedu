// GET/POST /api/v1/admin/academic-terms：学期管理
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const terms = await prisma.academicTerm.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { creator: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      items: terms.map((t) => ({
        id: t.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: t.isActive,
        createdByName: t.creator.name,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const startDate = new Date(body?.startDate);
  const endDate = new Date(body?.endDate);
  const isActive = body?.isActive === undefined ? true : Boolean(body.isActive);

  if (!name || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return jsonError(400, "INVALID_INPUT", "name/startDate/endDate 不能为空");
  }
  if (startDate.getTime() >= endDate.getTime()) {
    return jsonError(400, "INVALID_PERIOD", "学期开始日期必须早于结束日期");
  }

  const term = await prisma.academicTerm.create({
    data: {
      name,
      startDate,
      endDate,
      isActive,
      createdById: auth.user.id,
    },
  });
  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "CREATE_ACADEMIC_TERM",
    targetType: "AcademicTerm",
    targetId: term.id,
    summary: `创建学期：${name}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { termId: term.id } });
}
