import type { PrismaClient } from "../generated/prisma/client";

type MasteryDb = Pick<
  PrismaClient,
  "knowledgeMastery" | "wrongQuestionKnowledgePoint" | "wrongQuestion"
>;

export type MasteryOutcome = "CORRECT" | "PARTIAL" | "INCORRECT";

export interface MasterySnapshot {
  knowledgePoint: string;
  masteryScore: number;
  stability: number;
  difficulty: number;
  reviewCount: number;
  lapseCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function nextMasteryState(
  current: MasterySnapshot | null,
  outcome: MasteryOutcome,
  now = new Date(),
): Omit<MasterySnapshot, "knowledgePoint"> {
  const score = current?.masteryScore ?? 35;
  const stability = current?.stability ?? 1;
  const difficulty = current?.difficulty ?? 5;

  const target = outcome === "CORRECT" ? 100 : outcome === "PARTIAL" ? 60 : 0;
  const weight = outcome === "INCORRECT" ? 0.28 : 0.24;
  const masteryScore = clamp(Math.round(score * (1 - weight) + target * weight), 0, 100);

  let nextStability: number;
  let nextDifficulty: number;
  let intervalDays: number;
  if (outcome === "CORRECT") {
    nextStability = clamp(stability * (1.8 + masteryScore / 100), 1, 90);
    nextDifficulty = clamp(difficulty - 0.25, 1, 10);
    intervalDays = clamp(Math.round(nextStability * (0.8 + masteryScore / 100)), 1, 90);
  } else if (outcome === "PARTIAL") {
    nextStability = clamp(stability * 1.15, 0.8, 45);
    nextDifficulty = clamp(difficulty + 0.1, 1, 10);
    intervalDays = clamp(Math.round(nextStability * 0.75), 1, 21);
  } else {
    nextStability = clamp(stability * 0.5, 0.5, 10);
    nextDifficulty = clamp(difficulty + 0.55, 1, 10);
    intervalDays = 1;
  }

  return {
    masteryScore,
    stability: Number(nextStability.toFixed(2)),
    difficulty: Number(nextDifficulty.toFixed(2)),
    reviewCount: (current?.reviewCount ?? 0) + 1,
    lapseCount: (current?.lapseCount ?? 0) + (outcome === "INCORRECT" ? 1 : 0),
    lastReviewedAt: now,
    nextReviewAt: addDays(now, intervalDays),
  };
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

export async function applyMasteryReview(
  db: MasteryDb,
  input: {
    studentId: string;
    subject: "MATH" | "ENGLISH";
    knowledgePoints: string[];
    outcome: MasteryOutcome;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const points = [...new Set(input.knowledgePoints.map((point) => point.trim()).filter(Boolean))].slice(0, 8);
  const results = [];

  for (const knowledgePoint of points) {
    const current = await db.knowledgeMastery.findUnique({
      where: {
        studentId_subject_knowledgePoint: {
          studentId: input.studentId,
          subject: input.subject,
          knowledgePoint,
        },
      },
    });
    const next = nextMasteryState(current, input.outcome, now);
    const saved = await db.knowledgeMastery.upsert({
      where: {
        studentId_subject_knowledgePoint: {
          studentId: input.studentId,
          subject: input.subject,
          knowledgePoint,
        },
      },
      create: {
        studentId: input.studentId,
        subject: input.subject,
        knowledgePoint,
        ...next,
      },
      update: next,
    });
    results.push(saved);
  }

  return results;
}

export async function seedMasteryFromWrongQuestions(
  db: MasteryDb,
  studentId: string,
  now = new Date(),
): Promise<void> {
  const rows = await db.wrongQuestionKnowledgePoint.findMany({
    where: {
      wrongQuestion: {
        studentId,
        deletedAt: null,
        status: { in: ["PUBLISHED", "REVIEWED"] },
      },
    },
    include: {
      wrongQuestion: {
        select: {
          subject: true,
          mastered: true,
        },
      },
    },
  });

  const grouped = new Map<string, {
    subject: "MATH" | "ENGLISH";
    knowledgePoint: string;
    total: number;
    unresolved: number;
  }>();

  for (const row of rows) {
    const key = `${row.wrongQuestion.subject}::${row.knowledgePoint}`;
    const item = grouped.get(key) ?? {
      subject: row.wrongQuestion.subject,
      knowledgePoint: row.knowledgePoint,
      total: 0,
      unresolved: 0,
    };
    item.total += 1;
    if (row.wrongQuestion.mastered !== true) item.unresolved += 1;
    grouped.set(key, item);
  }

  for (const item of grouped.values()) {
    const existing = await db.knowledgeMastery.findUnique({
      where: {
        studentId_subject_knowledgePoint: {
          studentId,
          subject: item.subject,
          knowledgePoint: item.knowledgePoint,
        },
      },
      select: { id: true },
    });
    if (existing) continue;

    const masteryScore = clamp(
      item.unresolved > 0 ? 55 - item.unresolved * 7 : 68 + Math.min(item.total, 4) * 3,
      20,
      82,
    );
    await db.knowledgeMastery.create({
      data: {
        studentId,
        subject: item.subject,
        knowledgePoint: item.knowledgePoint,
        masteryScore,
        stability: item.unresolved > 0 ? 1 : 2,
        difficulty: item.unresolved > 0 ? 6 : 4.5,
        reviewCount: 0,
        lapseCount: item.unresolved,
        nextReviewAt: item.unresolved > 0 ? now : addDays(now, 3),
      },
    });
  }
}
