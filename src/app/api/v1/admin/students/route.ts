// 管理员学生管理：列表查询
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20),
  );

  const where = keyword
    ? {
        OR: [
          { name: { contains: keyword } },
          { grade: { contains: keyword } },
          { school: { contains: keyword } },
        ],
      }
    : {};

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        familyAccount: { include: { user: true } },
        teacherAssignments: {
          where: { endsAt: null },
          include: { teacher: { include: { user: true } } },
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      total,
      page,
      pageSize,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        school: s.school,
        familyPhone: s.familyAccount.user.phone,
        teachers: s.teacherAssignments.map((a) => ({
          assignmentId: a.id,
          teacherId: a.teacherId,
          name: a.teacher.user.name,
        })),
      })),
    },
  });
}
