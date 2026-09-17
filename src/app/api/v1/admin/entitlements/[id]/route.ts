// 管理员权益调整
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
  const remainingHours =
    body?.remainingHours === undefined ? undefined : Number(body.remainingHours);
  const usedHours = body?.usedHours === undefined ? undefined : Number(body.usedHours);
  const monthlyOneOnOneHours =
    body?.monthlyOneOnOneHours === undefined
      ? undefined
      : Number(body.monthlyOneOnOneHours);
  const paid = body?.paid === undefined ? undefined : Boolean(body.paid);

  if (
    (remainingHours !== undefined && (!Number.isInteger(remainingHours) || remainingHours < 0)) ||
    (usedHours !== undefined && (!Number.isInteger(usedHours) || usedHours < 0)) ||
    (monthlyOneOnOneHours !== undefined &&
      (!Number.isInteger(monthlyOneOnOneHours) || monthlyOneOnOneHours < 0))
  ) {
    return jsonError(400, "INVALID_INPUT", "课时数字必须是非负整数");
  }

  const existing = await prisma.studentEntitlement.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(404, "ENTITLEMENT_NOT_FOUND", "权益记录不存在");
  }

  const entitlement = await prisma.studentEntitlement.update({
    where: { id },
    data: {
      ...(remainingHours !== undefined ? { remainingHours } : {}),
      ...(usedHours !== undefined ? { usedHours } : {}),
      ...(monthlyOneOnOneHours !== undefined ? { monthlyOneOnOneHours } : {}),
      ...(paid !== undefined ? { paid } : {}),
    },
  });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "UPDATE_ENTITLEMENT",
    targetType: "StudentEntitlement",
    targetId: entitlement.id,
    summary: `管理员调整权益：${JSON.stringify({
      remainingHours,
      usedHours,
      monthlyOneOnOneHours,
      paid,
    })}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { entitlement } });
}
