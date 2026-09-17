// POST /api/v1/reports/generate：旧月报生成兼容别名，映射到 type=MONTHLY 的学习总结
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import {
  generateSummaryTx,
  monthPeriodFromString,
  SummaryError,
} from "../../../../../lib/summary";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const studentId = typeof body?.studentId === "string" ? body.studentId : "";
  const month = typeof body?.month === "string" ? body.month.trim() : "";
  if (!studentId || !/^\d{4}-\d{2}$/.test(month)) {
    return jsonError(400, "INVALID_INPUT", "studentId 与月份（YYYY-MM）不能为空");
  }

  if (auth.user.role === "TEACHER") {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    const isAssigned = (teacherProfile?.assignments ?? []).some(
      (a) => a.studentId === studentId,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能为自己负责的学生生成月报");
    }
  }

  try {
    const period = monthPeriodFromString(month);
    const { summaryId, created } = await generateSummaryTx(prisma, {
      studentId,
      type: "MONTHLY",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "GENERATE_REPORT",
      targetType: "LearningSummary",
      targetId: summaryId,
      summary: `${created ? "生成" : "复用"} ${month} 月报草稿`,
      ip: getClientIp(request),
    });
    return NextResponse.json({
      success: true,
      data: { reportId: summaryId, created },
    });
  } catch (error) {
    if (error instanceof SummaryError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
