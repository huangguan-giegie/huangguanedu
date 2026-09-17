// POST /api/v1/summaries/generate：手动生成学习总结草稿（幂等）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import {
  generateSummaryTx,
  monthPeriod,
  monthPeriodFromString,
  semesterPeriod,
  SummaryError,
  weekPeriod,
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
  const type = body?.type as "WEEKLY" | "MONTHLY" | "SEMESTER" | undefined;
  if (!studentId || (type !== "WEEKLY" && type !== "MONTHLY" && type !== "SEMESTER")) {
    return jsonError(400, "INVALID_INPUT", "studentId 与 type 不能为空");
  }

  // 周期来源：显式日期 / month(YYYY-MM) / week(YYYY-MM-DD) / termId
  let periodStart: Date;
  let periodEnd: Date;
  const explicitStart = typeof body?.periodStart === "string" ? body.periodStart : "";
  const explicitEnd = typeof body?.periodEnd === "string" ? body.periodEnd : "";
  const month = typeof body?.month === "string" ? body.month.trim() : "";
  const week = typeof body?.week === "string" ? body.week.trim() : "";
  const termId = typeof body?.termId === "string" ? body.termId : "";

  if (explicitStart && explicitEnd) {
    periodStart = new Date(explicitStart);
    periodEnd = new Date(explicitEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return jsonError(400, "INVALID_PERIOD", "periodStart/periodEnd 日期格式非法");
    }
  } else if (type === "MONTHLY" && month) {
    const period = monthPeriodFromString(month);
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
  } else if (type === "WEEKLY" && week) {
    const ref = new Date(`${week}T00:00:00`);
    if (Number.isNaN(ref.getTime())) {
      return jsonError(400, "INVALID_PERIOD", "week 日期格式非法");
    }
    const period = weekPeriod(ref);
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
  } else if (type === "SEMESTER" && termId) {
    const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
    if (!term) {
      return jsonError(404, "TERM_NOT_FOUND", "学期不存在");
    }
    const period = semesterPeriod(term);
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
  } else {
    const period =
      type === "WEEKLY" ? weekPeriod() : type === "MONTHLY" ? monthPeriod() : null;
    if (!period) {
      return jsonError(400, "INVALID_PERIOD", "学期总结需要 termId 或显式日期");
    }
    periodStart = period.periodStart;
    periodEnd = period.periodEnd;
  }

  // 老师只能为自己负责的学生生成总结
  if (auth.user.role === "TEACHER") {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null } } },
    });
    const isAssigned = (teacherProfile?.assignments ?? []).some(
      (a) => a.studentId === studentId,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能为自己负责的学生生成总结");
    }
  }

  try {
    const { summaryId, created } = await generateSummaryTx(prisma, {
      studentId,
      type,
      periodStart,
      periodEnd,
    });
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "GENERATE_SUMMARY",
      targetType: "LearningSummary",
      targetId: summaryId,
      summary: `${created ? "生成" : "复用"} ${type} 学习总结草稿`,
      ip: getClientIp(request),
    });
    return NextResponse.json({
      success: true,
      data: { summaryId, created },
    });
  } catch (error) {
    if (error instanceof SummaryError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
