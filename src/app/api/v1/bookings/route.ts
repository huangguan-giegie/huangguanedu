// POST /api/v1/bookings：家庭端预约一对一课程
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../lib/auth";
import { createBookingTx, BookingError } from "../../../../lib/booking";
import { assertStateChangeAllowed } from "../../../../lib/csrf";
import { prisma } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const slotId = typeof body?.slotId === "string" ? body.slotId : "";
  if (!slotId) {
    return jsonError(400, "INVALID_INPUT", "slotId 不能为空");
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!familyAccount?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  }

  try {
    const { bookingId } = await createBookingTx(
      prisma,
      familyAccount.student.id,
      slotId,
    );
    return NextResponse.json({ success: true, data: { bookingId } });
  } catch (error) {
    if (error instanceof BookingError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
