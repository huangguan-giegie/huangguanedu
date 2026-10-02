// GET /api/v1/teacher/students/:studentId/wrong-questions：查看负责学生的错题
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../../lib/auth";
import { prisma } from "../../../../../../../lib/db";

type RouteContext = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["TEACHER"]);
  if ("error" in auth) return auth.error;

  const { studentId } = await context.params;
  const assignment = await prisma.teacherStudentAssignment.findFirst({
    where: { studentId, endsAt: null, teacher: { userId: auth.user.id } },
    select: { id: true },
  });
  if (!assignment) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "只能查看自己负责学生的错题" } }, { status: 403 });
  }
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, grade: true },
  });

  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const mastered = searchParams.get("mastered");
  const items = await prisma.wrongQuestion.findMany({
    where: {
      studentId,
      deletedAt: null,
      status: { in: ["PUBLISHED", "REVIEWED"] },
      ...(subject === "MATH" || subject === "ENGLISH" ? { subject } : {}),
      ...(mastered === "true" || mastered === "false" ? { mastered: mastered === "true" } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      knowledgePointRecords: true,
      favorites: { where: { userId: auth.user.id }, select: { id: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      student,
      items: items.map((item) => ({
        id: item.id,
        subject: item.subject,
        recognizedQuestion: item.recognizedQuestion,
        knowledgePoints: item.knowledgePointRecords.map((point) => point.knowledgePoint),
        mastered: item.mastered,
        status: item.status,
        isTeacherReviewed: item.isTeacherReviewed,
        isFavorite: item.favorites.length > 0,
        updatedAt: item.updatedAt,
      })),
    },
  });
}
