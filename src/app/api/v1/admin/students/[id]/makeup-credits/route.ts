// 管理员补课：增加剩余课时并记录 MakeupCredit
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../../lib/csrf";
import { prisma } from "../../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const studentId = (await context.params).id;
  const body = await request.json().catch(() => null);
  const hours = Number(body?.hours);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(hours) || hours <= 0) {
    return jsonError(400, "INVALID_INPUT", "补课时数必须为正整数");
  }
  if (!reason) {
    return jsonError(400, "INVALID_INPUT", "补课原因不能为空");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { entitlements: { where: { plan: { type: "ONE_ON_ONE" } } } },
  });
  if (!student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  // 优先给第一条一对一权益增加课时；没有则报错（演示数据有一对一权益）
  const entitlement = student.entitlements[0];
  if (!entitlement) {
    return jsonError(400, "NO_ENTITLEMENT", "该学生没有一对一课时权益");
  }

  await prisma.$transaction([
    prisma.studentEntitlement.update({
      where: { id: entitlement.id },
      data: { remainingHours: { increment: hours } },
    }),
    prisma.makeupCredit.create({
      data: {
        studentId,
        hours,
        reason,
        createdBy: auth.user.id,
      },
    }),
  ]);

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "ADD_MAKEUP_CREDIT",
    targetType: "Student",
    targetId: studentId,
    summary: `管理员为 ${student.name} 补课 ${hours} 小时：${reason}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({
    success: true,
    data: { entitlementId: entitlement.id, hours },
  });
}
