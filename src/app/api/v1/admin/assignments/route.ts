// 管理员分配关系：创建老师-学生负责关系
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../lib/auth";
import { writeAuditLog } from "../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const body = await request.json().catch(() => null);
  const teacherId = typeof body?.teacherId === "string" ? body.teacherId : "";
  const studentId = typeof body?.studentId === "string" ? body.studentId : "";

  if (!teacherId || !studentId) {
    return jsonError(400, "INVALID_INPUT", "teacherId 和 studentId 不能为空");
  }

  const [teacher, student] = await Promise.all([
    prisma.teacherProfile.findUnique({ where: { id: teacherId } }),
    prisma.student.findUnique({ where: { id: studentId } }),
  ]);
  if (!teacher) {
    return jsonError(404, "TEACHER_NOT_FOUND", "老师不存在");
  }
  if (!student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  const existing = await prisma.teacherStudentAssignment.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
  });
  if (existing?.endsAt === null) {
    return jsonError(409, "ASSIGNMENT_EXISTS", "该负责关系已存在");
  }

  // 已结束的历史关系重新启用，否则新建
  const assignment = existing
    ? await prisma.teacherStudentAssignment.update({
        where: { id: existing.id },
        data: { endsAt: null, startsAt: new Date() },
      })
    : await prisma.teacherStudentAssignment.create({
        data: { teacherId, studentId },
      });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "CREATE_ASSIGNMENT",
    targetType: "TeacherStudentAssignment",
    targetId: assignment.id,
    summary: `管理员建立负责关系：老师 ${teacher.userId} -> 学生 ${student.id}`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { assignment } });
}
