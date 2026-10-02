// GET /api/v1/wrong-questions/export：导出当前用户有权查看的错题本
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import type { Prisma } from "../../../../../generated/prisma/client";
import {
  buildExportFilename,
  buildWrongQuestionsMarkdown,
  toExportableWrongQuestion,
} from "../../../../../lib/wrong-question-export";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const requestedStudentId = searchParams.get("studentId")?.trim();
  const subject = searchParams.get("subject");
  const mastered = searchParams.get("mastered");
  const from = searchParams.get("from");
  const knowledgePoint = searchParams.get("knowledgePoint")?.trim();
  const where: Prisma.WrongQuestionWhereInput = {
    deletedAt: null,
    status: { in: ["PROCESSING", "PENDING_STUDENT_CONFIRMATION", "PUBLISHED", "NEEDS_REVIEW", "REVIEWED"] },
  };

  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      return jsonError(400, "INVALID_INPUT", "开始时间格式不正确");
    }
    where.updatedAt = { gte: fromDate };
  }
  if (subject === "MATH" || subject === "ENGLISH") where.subject = subject;
  if (mastered === "true" || mastered === "false") where.mastered = mastered === "true";
  if (knowledgePoint) {
    where.knowledgePointRecords = { some: { knowledgePoint: { contains: knowledgePoint } } };
  }

  if (auth.user.role === "FAMILY") {
    const account = await prisma.familyAccount.findUnique({
      where: { userId: auth.user.id },
      include: { student: true },
    });
    if (!account?.student) {
      return NextResponse.json({ success: true, data: { content: "", filename: buildExportFilename(), count: 0 } });
    }
    where.studentId = account.student.id;
  } else if (auth.user.role === "TEACHER") {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { userId: auth.user.id },
      include: { assignments: { where: { endsAt: null }, select: { studentId: true } } },
    });
    const ids = (teacher?.assignments ?? []).map((assignment) => assignment.studentId);
    if (requestedStudentId && !ids.includes(requestedStudentId)) {
      return jsonError(403, "FORBIDDEN", "只能导出自己负责学生的错题");
    }
    where.studentId = requestedStudentId ?? { in: ids };
  } else if (requestedStudentId) {
    where.studentId = requestedStudentId;
  }

  const items = await prisma.wrongQuestion.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: { knowledgePointRecords: true },
  });
  const content = buildWrongQuestionsMarkdown({
    items: items.map((item) => toExportableWrongQuestion(item)),
    subject: subject === "MATH" || subject === "ENGLISH" ? subject : undefined,
  });

  return NextResponse.json({
    success: true,
    data: { content, filename: buildExportFilename(), count: items.length },
  });
}
