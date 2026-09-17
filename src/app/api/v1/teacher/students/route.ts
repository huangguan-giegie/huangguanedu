// GET /api/v1/teacher/students：返回当前老师负责的学生列表
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";

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
        include: {
          student: true,
        },
      },
    },
  });

  // 管理员查看全部学生的分配关系
  const assignments =
    auth.user.role === "ADMIN"
      ? await prisma.teacherStudentAssignment.findMany({
          where: { endsAt: null },
          include: { student: true },
        })
      : (teacherProfile?.assignments ?? []);

  const students = assignments.map((a) => ({
    assignmentId: a.id,
    student: {
      id: a.student.id,
      name: a.student.name,
      grade: a.student.grade,
      school: a.student.school,
    },
  }));

  return NextResponse.json({ success: true, data: { students } });
}
