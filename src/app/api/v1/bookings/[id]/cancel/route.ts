// PATCH /api/v1/bookings/:id/cancel：家庭端取消自己的预约
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { BookingError, cancelBookingTx } from "../../../../../../lib/booking";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!familyAccount?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  }

  // 只能取消自己学生的预约
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return jsonError(404, "BOOKING_NOT_FOUND", "预约不存在");
  }
  if (booking.studentId !== familyAccount.student.id) {
    return jsonError(403, "FORBIDDEN", "只能取消自己的预约");
  }

  try {
    await cancelBookingTx(prisma, id);
    return NextResponse.json({ success: true, data: { bookingId: id } });
  } catch (error) {
    if (error instanceof BookingError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
