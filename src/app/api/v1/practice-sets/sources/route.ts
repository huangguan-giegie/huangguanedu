import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { allowedPracticeStudents } from "../../../../../lib/practice-set";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const students = await allowedPracticeStudents(prisma, auth.user);
  const requestedId = request.nextUrl.searchParams.get("studentId")?.trim();
  if (requestedId && !students.some((s) => s.id === requestedId)) return jsonError(403, "FORBIDDEN", "无权查看该学生错题");
  const studentId = requestedId || students[0]?.id || null;
  const subject = request.nextUrl.searchParams.get("subject");
  if (subject && subject !== "MATH" && subject !== "ENGLISH") return jsonError(400, "INVALID_INPUT", "科目须为数学或英语");
  const questions = studentId ? await prisma.wrongQuestion.findMany({ where: { studentId, deletedAt: null, status: { in: ["PUBLISHED", "REVIEWED"] }, recognizedQuestion: { not: null }, ...(subject ? { subject: subject as "MATH" | "ENGLISH" } : {}) }, orderBy: { updatedAt: "desc" }, include: { knowledgePointRecords: true } }) : [];
  return NextResponse.json({ success: true, data: { students, studentId, items: questions.filter((q) => q.recognizedQuestion?.trim()).map((q) => ({ id: q.id, subject: q.subject, recognizedQuestion: q.recognizedQuestion, knowledgePoints: q.knowledgePointRecords.map((r) => r.knowledgePoint), difficulty: q.difficulty })) } });
}
