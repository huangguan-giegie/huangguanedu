// PATCH /api/v1/reports/:id/review：旧月报审核兼容别名（映射到学习总结审核）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";
import { reviewSummaryTx, SummaryError } from "../../../../../../lib/summary";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;

  if (auth.user.role === "TEACHER") {
    const summary = await prisma.learningSummary.findUnique({
      where: { id },
    });
    if (!summary) {
      return jsonError(404, "SUMMARY_NOT_FOUND", "月报不存在");
    }
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    const isAssigned = (teacherProfile?.assignments ?? []).some(
      (a) => a.studentId === summary.studentId,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能审核自己负责学生的月报");
    }
  }

  try {
    await reviewSummaryTx(prisma, id, auth.user.id);
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "REVIEW_REPORT",
      targetType: "LearningSummary",
      targetId: id,
      summary: "审核月报",
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, data: { reportId: id } });
  } catch (error) {
    if (error instanceof SummaryError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
