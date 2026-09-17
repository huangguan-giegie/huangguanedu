// PATCH /api/v1/admin/academic-terms/:id：修改学期
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const startDate = body?.startDate ? new Date(body.startDate) : undefined;
  const endDate = body?.endDate ? new Date(body.endDate) : undefined;
  const isActive = body?.isActive === undefined ? undefined : Boolean(body.isActive);

  const existing = await prisma.academicTerm.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(404, "TERM_NOT_FOUND", "学期不存在");
  }
  if (startDate && Number.isNaN(startDate.getTime())) {
    return jsonError(400, "INVALID_INPUT", "startDate 日期格式非法");
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    return jsonError(400, "INVALID_INPUT", "endDate 日期格式非法");
  }
  const effectiveStart = startDate ?? existing.startDate;
  const effectiveEnd = endDate ?? existing.endDate;
  if (effectiveStart.getTime() >= effectiveEnd.getTime()) {
    return jsonError(400, "INVALID_PERIOD", "学期开始日期必须早于结束日期");
  }

  const term = await prisma.academicTerm.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });
  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "UPDATE_ACADEMIC_TERM",
    targetType: "AcademicTerm",
    targetId: term.id,
    summary: `修改学期：${existing.name} -> ${term.name}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { termId: term.id } });
}
