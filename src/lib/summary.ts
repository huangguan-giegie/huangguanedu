// 学习总结领域逻辑：周期计算、统计、AI 建议、生成/审核/发布（幂等）。
// 每名学生、每种总结类型、每个统计周期最多一份，重复生成返回已存在总结。
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { SummaryType } from "../generated/prisma/enums";
import { generateSummaryAi, SummaryAiError } from "./summary-ai";

export { SummaryAiError };

export class SummaryError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SummaryPeriod {
  type: SummaryType;
  periodStart: Date;
  periodEnd: Date;
  label: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 周报周期：周一 00:00 至下周一 00:00（含周一至周日）。 */
export function weekPeriod(reference = new Date()): SummaryPeriod {
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    type: "WEEKLY",
    periodStart: start,
    periodEnd: end,
    label: `周报 ${isoDate(start)}`,
  };
}

/** 月报周期：自然月首日 00:00 至下月首日 00:00。 */
export function monthPeriod(reference = new Date()): SummaryPeriod {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return {
    type: "MONTHLY",
    periodStart: start,
    periodEnd: end,
    label: `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`,
  };
}

/** 学期周期：管理员配置的开始日期 00:00 至结束日期次日 00:00。 */
export function semesterPeriod(term: {
  startDate: Date;
  endDate: Date;
}): SummaryPeriod {
  const start = new Date(term.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(term.endDate);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return {
    type: "SEMESTER",
    periodStart: start,
    periodEnd: end,
    label: `${isoDate(start)} 至 ${isoDate(term.endDate)}`,
  };
}

/** 解析 YYYY-MM 月报周期。 */
export function monthPeriodFromString(month: string): SummaryPeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new SummaryError(400, "INVALID_MONTH", "月份格式应为 YYYY-MM");
  }
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  if (monthNum < 1 || monthNum > 12) {
    throw new SummaryError(400, "INVALID_MONTH", "月份格式应为 YYYY-MM");
  }
  return monthPeriod(new Date(year, monthNum - 1, 1));
}

export interface SummaryStats {
  periodStart: string;
  periodEnd: string;
  totalWrongQuestions: number;
  publishedCount: number;
  reviewedCount: number;
  mastered: number;
  occurrences: number;
  subjectDistribution: Record<string, number>;
  errorCauses: Record<string, number>;
  weakKnowledgePoints: {
    knowledgePoint: string;
    count: number;
    lastAt: string;
  }[];
}

/** 本地统计错题变化、学科分布、知识点与错误原因（不调用 AI）。 */
export async function computeSummaryStats(
  prisma: PrismaClient,
  studentId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SummaryStats> {
  const wrongQuestions = await prisma.wrongQuestion.findMany({
    where: {
      studentId,
      deletedAt: null,
      status: { in: ["PUBLISHED", "REVIEWED"] },
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    include: {
      knowledgePointRecords: true,
      occurrences: true,
    },
  });

  const subjectDistribution: Record<string, number> = {};
  const errorCauseCount: Record<string, number> = {};
  const byPoint = new Map<string, { count: number; lastAt: number }>();

  for (const wq of wrongQuestions) {
    subjectDistribution[wq.subject] = (subjectDistribution[wq.subject] ?? 0) + 1;
    const causes = (wq.errorCauses as string[] | null) ?? [];
    for (const cause of causes) {
      errorCauseCount[cause] = (errorCauseCount[cause] ?? 0) + 1;
    }
    for (const record of wq.knowledgePointRecords) {
      const current = byPoint.get(record.knowledgePoint) ?? { count: 0, lastAt: 0 };
      current.count += 1 + wq.occurrences.length;
      current.lastAt = Math.max(
        current.lastAt,
        wq.occurrences.length > 0
          ? Math.max(...wq.occurrences.map((o) => o.occurredAt.getTime()))
          : wq.createdAt.getTime(),
      );
      byPoint.set(record.knowledgePoint, current);
    }
  }

  const weakKnowledgePoints = [...byPoint.entries()]
    .map(([knowledgePoint, v]) => ({
      knowledgePoint,
      count: v.count,
      lastAt: new Date(v.lastAt).toISOString(),
    }))
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalWrongQuestions: wrongQuestions.length,
    publishedCount: wrongQuestions.filter((w) => w.status === "PUBLISHED").length,
    reviewedCount: wrongQuestions.filter((w) => w.status === "REVIEWED").length,
    mastered: wrongQuestions.filter((w) => w.mastered === true).length,
    occurrences: wrongQuestions.reduce((sum, w) => sum + w.occurrences.length, 0),
    subjectDistribution,
    errorCauses: errorCauseCount,
    weakKnowledgePoints,
  };
}

export interface GenerateSummaryInput {
  studentId: string;
  type: SummaryType;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * 生成学习总结草稿（幂等）：
 * - 已有同周期总结时直接返回已存在记录；
 * - 统计结果始终保存；AI 建议失败时标记 needsRetry，不自动发布。
 */
export async function generateSummaryTx(
  prisma: PrismaClient,
  input: GenerateSummaryInput,
): Promise<{ summaryId: string; created: boolean }> {
  if (input.periodStart.getTime() >= input.periodEnd.getTime()) {
    throw new SummaryError(400, "INVALID_PERIOD", "统计周期开始时间必须早于结束时间");
  }

  const existing = await prisma.learningSummary.findUnique({
    where: {
      studentId_type_periodStart_periodEnd: {
        studentId: input.studentId,
        type: input.type,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    },
  });
  if (existing) {
    return { summaryId: existing.id, created: false };
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) {
    throw new SummaryError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  const stats = await computeSummaryStats(
    prisma,
    input.studentId,
    input.periodStart,
    input.periodEnd,
  );

  const dominantSubject: "MATH" | "ENGLISH" =
    (stats.subjectDistribution["ENGLISH"] ?? 0) >
    (stats.subjectDistribution["MATH"] ?? 0)
      ? "ENGLISH"
      : "MATH";

  let aiSuggestions: unknown = null;
  let aiError: string | null = null;
  let aiShouldRetry = false;
  let isAiGenerated = false;
  let aiGeneratedAt: Date | null = null;
  try {
    const ai = await generateSummaryAi({
      studentName: student.name,
      periodLabel: `${input.type} ${input.periodStart.toISOString().slice(0, 10)}`,
      dominantSubject,
      stats: {
        totalWrongQuestions: stats.totalWrongQuestions,
        mastered: stats.mastered,
        weakKnowledgePoints: stats.weakKnowledgePoints.map((p) => p.knowledgePoint),
      },
    });
    aiSuggestions = ai;
    isAiGenerated = true;
    aiGeneratedAt = new Date();
  } catch (error) {
    aiError = error instanceof Error ? error.message : "未知错误";
    aiShouldRetry = error instanceof SummaryAiError && error.retryable;
  }

  try {
    const summary = await prisma.learningSummary.create({
      data: {
        studentId: input.studentId,
        type: input.type,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "DRAFT",
        stats: stats as unknown as Prisma.InputJsonValue,
        aiSuggestions: aiSuggestions as Prisma.InputJsonValue | undefined,
        aiError,
        aiGeneratedAt,
        isAiGenerated,
        needsRetry: aiShouldRetry,
      },
    });
    return { summaryId: summary.id, created: true };
  } catch (error) {
    // 并发下撞唯一约束：返回已存在记录，保证幂等
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      const summary = await prisma.learningSummary.findUniqueOrThrow({
        where: {
          studentId_type_periodStart_periodEnd: {
            studentId: input.studentId,
            type: input.type,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
        },
      });
      return { summaryId: summary.id, created: false };
    }
    throw error;
  }
}

/** 审核学习总结：草稿/待审核 -> 已审核（老师负责关系由路由层校验）。 */
export async function reviewSummaryTx(
  prisma: PrismaClient,
  summaryId: string,
  reviewerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const summary = await tx.learningSummary.findUnique({
      where: { id: summaryId },
    });
    if (!summary) {
      throw new SummaryError(404, "SUMMARY_NOT_FOUND", "学习总结不存在");
    }
    if (summary.status !== "DRAFT" && summary.status !== "PENDING_REVIEW") {
      throw new SummaryError(400, "INVALID_STATUS", "当前状态不可审核");
    }
    await tx.learningSummary.update({
      where: { id: summaryId },
      data: {
        status: "REVIEWED",
        reviewerId,
        reviewedAt: new Date(),
        isTeacherReviewed: true,
        needsRetry: false,
      },
    });
  });
}

/** 发布学习总结：仅已审核可发布。 */
export async function publishSummaryTx(
  prisma: PrismaClient,
  summaryId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const summary = await tx.learningSummary.findUnique({
      where: { id: summaryId },
    });
    if (!summary) {
      throw new SummaryError(404, "SUMMARY_NOT_FOUND", "学习总结不存在");
    }
    if (summary.status !== "REVIEWED") {
      throw new SummaryError(400, "INVALID_STATUS", "仅已审核总结可发布");
    }
    await tx.learningSummary.update({
      where: { id: summaryId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  });
}

export interface DueSummaryResult {
  generated: number;
  retried: number;
  errors: number;
}

/**
 * 每日定时任务：检查已结束的周/月/学期周期并自动生成草稿；
 * 同时重试 AI 失败（needsRetry）的总结。
 */
export async function processDueSummaries(
  prisma: PrismaClient,
  now = new Date(),
): Promise<DueSummaryResult> {
  const result: DueSummaryResult = { generated: 0, retried: 0, errors: 0 };

  const students = await prisma.student.findMany({ select: { id: true } });
  const periods: Array<{
    studentId: string;
    type: SummaryType;
    periodStart: Date;
    periodEnd: Date;
  }> = [];

  // 上一个完整周（周一至周日）
  const lastWeek = weekPeriod(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  // 上一个自然月
  const lastMonth = monthPeriod(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  );
  // 已结束的启用学期
  const terms = await prisma.academicTerm.findMany({
    where: { isActive: true, endDate: { lt: now } },
  });

  for (const student of students) {
    periods.push({
      studentId: student.id,
      type: "WEEKLY",
      periodStart: lastWeek.periodStart,
      periodEnd: lastWeek.periodEnd,
    });
    periods.push({
      studentId: student.id,
      type: "MONTHLY",
      periodStart: lastMonth.periodStart,
      periodEnd: lastMonth.periodEnd,
    });
    for (const term of terms) {
      const period = semesterPeriod(term);
      periods.push({
        studentId: student.id,
        type: "SEMESTER",
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });
    }
  }

  for (const period of periods) {
    try {
      const outcome = await generateSummaryTx(prisma, period);
      if (outcome.created) {
        result.generated += 1;
      }
    } catch (error) {
      result.errors += 1;
      console.error(
        `[summaries] 生成失败 student=${period.studentId} type=${period.type}`,
        error,
      );
    }
  }

  // 重试 AI 失败的总结
  const retryList = await prisma.learningSummary.findMany({
    where: { needsRetry: true, status: "DRAFT" },
    take: 50,
  });
  for (const summary of retryList) {
    try {
      const student = await prisma.student.findUniqueOrThrow({
        where: { id: summary.studentId },
      });
      const stats = (summary.stats ?? {}) as unknown as SummaryStats;
      const ai = await generateSummaryAi({
        studentName: student.name,
        periodLabel: `${summary.type} ${summary.periodStart.toISOString().slice(0, 10)}`,
        dominantSubject:
          (stats.subjectDistribution?.["ENGLISH"] ?? 0) >
          (stats.subjectDistribution?.["MATH"] ?? 0)
            ? "ENGLISH"
            : "MATH",
        stats: {
          totalWrongQuestions: stats.totalWrongQuestions ?? 0,
          mastered: stats.mastered ?? 0,
          weakKnowledgePoints: (stats.weakKnowledgePoints ?? []).map(
            (p) => p.knowledgePoint,
          ),
        },
      });
      await prisma.learningSummary.update({
        where: { id: summary.id },
        data: {
          aiSuggestions: ai,
          aiError: null,
          aiGeneratedAt: new Date(),
          isAiGenerated: true,
          needsRetry: false,
        },
      });
      result.retried += 1;
    } catch (error) {
      result.errors += 1;
      const shouldRetry = error instanceof SummaryAiError && error.retryable;
      if (!shouldRetry) {
        await prisma.learningSummary.update({
          where: { id: summary.id },
          data: {
            needsRetry: false,
            aiError: error instanceof Error ? error.message : "未知错误",
          },
        });
      }
      console.error(
        `[summaries] AI 重试失败 summary=${summary.id}`,
        error,
      );
    }
  }

  return result;
}
