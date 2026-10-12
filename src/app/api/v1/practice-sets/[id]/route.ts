import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { allowedPracticeStudents, serializePracticeSet } from "../../../../../lib/practice-set";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const students = await allowedPracticeStudents(prisma, auth.user);
  const set = await prisma.practiceSet.findFirst({ where: { id, studentId: { in: students.map((s) => s.id) } }, include: { student: true, questions: { orderBy: { createdAt: "asc" } } } });
  if (!set) return jsonError(404, "PRACTICE_SET_NOT_FOUND", "模拟题不存在或无权访问");
  return NextResponse.json({ success: true, data: await serializePracticeSet(set) });
}
