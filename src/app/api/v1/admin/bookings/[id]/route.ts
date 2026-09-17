// 管理员预约：变更状态（确认/完成/缺席/取消）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import {
  adminChangeBookingStatusTx,
  BookingError,
} from "../../../../../../lib/booking";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_ACTIONS = ["CONFIRM", "COMPLETE", "ABSENT", "CANCEL"] as const;

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
  const action = body?.action;
  if (!VALID_ACTIONS.includes(action)) {
    return jsonError(400, "INVALID_INPUT", "action 必须是 CONFIRM/COMPLETE/ABSENT/CANCEL");
  }

  try {
    await adminChangeBookingStatusTx(prisma, id, action);
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: `BOOKING_${action}`,
      targetType: "Booking",
      targetId: id,
      summary: `管理员将预约 ${id} 状态变更为 ${action}`,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, data: { bookingId: id } });
  } catch (error) {
    if (error instanceof BookingError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
