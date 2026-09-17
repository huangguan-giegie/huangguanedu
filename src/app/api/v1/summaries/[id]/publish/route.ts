// POST /api/v1/summaries/:id/publish：发布学习总结（仅已审核）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";
import { publishSummaryTx, SummaryError } from "../../../../../../lib/summary";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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
      return jsonError(404, "SUMMARY_NOT_FOUND", "学习总结不存在");
    }
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    const isAssigned = (teacherProfile?.assignments ?? []).some(
      (a) => a.studentId === summary.studentId,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能发布自己负责学生的总结");
    }
  }

  try {
    await publishSummaryTx(prisma, id);
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "PUBLISH_SUMMARY",
      targetType: "LearningSummary",
      targetId: id,
      summary: "发布学习总结",
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, data: { summaryId: id } });
  } catch (error) {
    if (error instanceof SummaryError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
