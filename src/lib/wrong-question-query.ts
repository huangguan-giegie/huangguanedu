// 错题列表与导出共用权限范围和筛选条件。
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { WrongQuestionError } from "./wrong-question";

export async function wrongQuestionWhere(
  prisma: PrismaClient,
  user: { id: string; role: "FAMILY" | "TEACHER" | "ADMIN" },
  params: URLSearchParams,
): Promise<Prisma.WrongQuestionWhereInput> {
  const where: Prisma.WrongQuestionWhereInput = {
    deletedAt: null,
    status: { in: ["PROCESSING", "PENDING_STUDENT_CONFIRMATION", "PUBLISHED", "NEEDS_REVIEW", "REVIEWED"] },
  };
  const studentId = params.get("studentId")?.trim();
  if (user.role === "FAMILY") {
    const account = await prisma.familyAccount.findUnique({ where: { userId: user.id }, include: { student: true } });
    where.studentId = account?.student?.id ?? { in: [] };
  } else if (user.role === "TEACHER") {
    const assignments = await prisma.teacherStudentAssignment.findMany({ where: { teacher: { userId: user.id }, endsAt: null }, select: { studentId: true } });
    const ids = assignments.map((assignment) => assignment.studentId);
    if (studentId && !ids.includes(studentId)) throw new WrongQuestionError(403, "FORBIDDEN", "只能查看自己负责学生的错题");
    where.studentId = studentId || { in: ids };
  } else if (studentId) {
    where.studentId = studentId;
  }
  const subject = params.get("subject");
  if (subject === "MATH" || subject === "ENGLISH") where.subject = subject;
  const mastered = params.get("mastered");
  if (mastered === "true" || mastered === "false") where.mastered = mastered === "true";
  const knowledgePoint = params.get("knowledgePoint")?.trim();
  if (knowledgePoint) where.knowledgePointRecords = { some: { knowledgePoint: { contains: knowledgePoint } } };
  const from = params.get("from");
  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) throw new WrongQuestionError(400, "INVALID_INPUT", "开始时间格式不正确");
    where.firstSeenAt = { gte: fromDate };
  }
  if (params.get("favorite") === "true") where.favorites = { some: { userId: user.id } };
  return where;
}
