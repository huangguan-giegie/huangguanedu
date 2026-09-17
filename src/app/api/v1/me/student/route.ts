// GET /api/v1/me/student：返回当前家庭账户绑定的学生信息（含套餐权益摘要）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: {
      student: {
        include: {
          entitlements: {
            include: { plan: true },
          },
        },
      },
    },
  });

  if (!familyAccount?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  }

  const { student } = familyAccount;
  return NextResponse.json({
    success: true,
    data: {
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        school: student.school,
        entitlements: student.entitlements.map((e) => ({
          id: e.id,
          planName: e.plan.name,
          planType: e.plan.type,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          paid: e.paid,
          usedHours: e.usedHours,
          remainingHours: e.remainingHours,
          monthlyOneOnOneHours: e.monthlyOneOnOneHours,
        })),
      },
    },
  });
}
