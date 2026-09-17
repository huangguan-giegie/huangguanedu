// 旧 SQLite 开发数据迁移（可选）：把旧 dev.db 中的月报/练习数据迁移到 PostgreSQL。
// 使用方式：DATABASE_URL=<PG> SQLITE_DEV_DB=./dev.db npm run migrate:sqlite-data
import "dotenv/config";

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const require = createRequire(join(process.cwd(), "package.json"));
const BetterSqlite3 = require("better-sqlite3") as new (
  filename: string,
) => {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
};

const sqlitePath = process.env.SQLITE_DEV_DB ?? "dev.db";
if (!existsSync(sqlitePath)) {
  console.log(`未找到旧 SQLite 数据库（${sqlitePath}），跳过数据迁移`);
  process.exit(0);
}

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/huangguanedu",
});
const prisma = new PrismaClient({ adapter });

interface OldRow {
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const sqlite = new BetterSqlite3(sqlitePath);

  const oldUsers = sqlite
    .prepare(
      'SELECT id, phone, role, name FROM "User" WHERE deletedAt IS NULL',
    )
    .all() as OldRow[];
  const oldStudents = sqlite
    .prepare(
      'SELECT id, name, familyAccountId FROM "Student" WHERE deletedAt IS NULL',
    )
    .all() as OldRow[];
  const oldFamilyAccounts = sqlite
    .prepare('SELECT id, userId FROM "FamilyAccount"')
    .all() as OldRow[];
  const oldReports = sqlite
    .prepare(
      'SELECT * FROM "MonthlyReport" ORDER BY "createdAt" ASC',
    )
    .all() as OldRow[];
  const oldSets = sqlite
    .prepare('SELECT * FROM "PracticeSet" ORDER BY "createdAt" ASC')
    .all() as OldRow[];
  const oldQuestions = sqlite
    .prepare('SELECT * FROM "PracticeQuestion" ORDER BY "createdAt" ASC')
    .all() as OldRow[];

  // phone -> PG user
  const pgUsers = await prisma.user.findMany({ select: { id: true, phone: true } });
  const phoneToPgUser = new Map(pgUsers.map((u) => [u.phone, u.id]));
  // old familyAccountId -> PG studentId（按 phone 匹配）
  const familyPhoneByAccount = new Map<string, string>();
  for (const account of oldFamilyAccounts) {
    const user = oldUsers.find((u) => u.id === account.userId);
    if (user?.phone) {
      familyPhoneByAccount.set(String(account.id), String(user.phone));
    }
  }
  const studentIdByOldStudent = new Map<string, string>();
  for (const student of oldStudents) {
    const phone = familyPhoneByAccount.get(String(student.familyAccountId));
    const pgUserId = phone ? phoneToPgUser.get(phone) : undefined;
    if (!pgUserId) {
      continue;
    }
    const pgStudent = await prisma.student.findFirst({
      where: { familyAccount: { userId: pgUserId } },
    });
    if (pgStudent) {
      studentIdByOldStudent.set(String(student.id), pgStudent.id);
    }
  }

  let migratedReports = 0;
  let migratedSets = 0;
  let migratedQuestions = 0;

  const oldReportIdToNewSummary = new Map<string, string>();
  for (const report of oldReports) {
    const pgStudentId = studentIdByOldStudent.get(String(report.studentId));
    if (!pgStudentId) {
      console.log(`跳过月报 ${report.id}：未找到匹配的 PostgreSQL 学生`);
      continue;
    }
    const month = String(report.month);
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
      continue;
    }
    const periodStart = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    const periodEnd = new Date(Number(match[1]), Number(match[2]), 1);

    const existing = await prisma.learningSummary.findUnique({
      where: {
        studentId_type_periodStart_periodEnd: {
          studentId: pgStudentId,
          type: "MONTHLY",
          periodStart,
          periodEnd,
        },
      },
    });
    if (existing) {
      oldReportIdToNewSummary.set(String(report.id), existing.id);
      continue;
    }

    const status = ["DRAFT", "PENDING_REVIEW", "REVIEWED", "PUBLISHED"].includes(
      String(report.status),
    )
      ? (String(report.status) as "DRAFT" | "PENDING_REVIEW" | "REVIEWED" | "PUBLISHED")
      : "DRAFT";
    const summary = await prisma.learningSummary.create({
      data: {
        studentId: pgStudentId,
        type: "MONTHLY",
        periodStart,
        periodEnd,
        status,
        stats: (report.stats as Prisma.InputJsonValue | null) ?? undefined,
        aiSuggestions:
          (report.aiSuggestions as Prisma.InputJsonValue | null) ?? undefined,
        isAiGenerated: true,
        isTeacherReviewed: status === "REVIEWED" || status === "PUBLISHED",
        reviewedAt: report.reviewedAt ? new Date(String(report.reviewedAt)) : undefined,
        publishedAt: report.publishedAt ? new Date(String(report.publishedAt)) : undefined,
        createdAt: new Date(String(report.createdAt)),
        updatedAt: new Date(String(report.updatedAt)),
      },
    });
    oldReportIdToNewSummary.set(String(report.id), summary.id);
    migratedReports += 1;
  }

  const oldSetIdToNewSet = new Map<string, string>();
  for (const set of oldSets) {
    const summaryId = oldReportIdToNewSummary.get(String(set.monthlyReportId));
    if (!summaryId) {
      continue;
    }
    const summary = await prisma.learningSummary.findUniqueOrThrow({
      where: { id: summaryId },
    });
    const practiceSet = await prisma.practiceSet.create({
      data: {
        studentId: summary.studentId,
        title: String(set.title),
        summaryId,
        createdAt: new Date(String(set.createdAt)),
      },
    });
    oldSetIdToNewSet.set(String(set.id), practiceSet.id);
    migratedSets += 1;
  }

  for (const question of oldQuestions) {
    const practiceSetId = oldSetIdToNewSet.get(String(question.practiceSetId));
    if (!practiceSetId) {
      continue;
    }
    await prisma.practiceQuestion.create({
      data: {
        practiceSetId,
        question: String(question.question),
        answer: String(question.answer),
        explanation: question.explanation ? String(question.explanation) : undefined,
        createdAt: new Date(String(question.createdAt)),
      },
    });
    migratedQuestions += 1;
  }

  sqlite.close();
  console.log(
    `SQLite 数据迁移完成：月报 ${migratedReports} 份，练习组 ${migratedSets} 个，练习 ${migratedQuestions} 道`,
  );
}

main()
  .catch((error) => {
    console.error("SQLite 数据迁移失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
