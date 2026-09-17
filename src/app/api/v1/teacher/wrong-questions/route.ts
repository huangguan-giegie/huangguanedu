// GET /api/v1/teacher/wrong-questions：老师待复核队列（NEEDS_REVIEW）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import type { Prisma } from "../../../../../generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: auth.user.id },
    include: {
      assignments: {
        where: { endsAt: null },
        select: { studentId: true },
      },
    },
  });
  const studentIds =
    auth.user.role === "ADMIN"
      ? undefined
      : (teacherProfile?.assignments ?? []).map((a) => a.studentId);

  const where: Prisma.WrongQuestionWhereInput = {
    status: "NEEDS_REVIEW",
    deletedAt: null,
  };
  if (studentIds) {
    where.studentId = { in: studentIds };
  }

  const items = await prisma.wrongQuestion.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      student: true,
      rawImages: { where: { deletedAt: null } },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      items: items.map((w) => ({
        id: w.id,
        subject: w.subject,
        studentName: w.student.name,
        recognizedQuestion: w.recognizedQuestion,
        needsTeacherReview: w.needsTeacherReview,
        aiConfidence: w.aiConfidence,
        updatedAt: w.updatedAt,
        hasImage: w.rawImages.length > 0,
      })),
    },
  });
}
