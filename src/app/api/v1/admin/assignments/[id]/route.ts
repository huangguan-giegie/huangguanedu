// 管理员分配关系：解除负责关系（软结束）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const existing = await prisma.teacherStudentAssignment.findUnique({
    where: { id },
  });
  if (!existing) {
    return jsonError(404, "ASSIGNMENT_NOT_FOUND", "负责关系不存在");
  }

  const assignment = await prisma.teacherStudentAssignment.update({
    where: { id },
    data: { endsAt: new Date() },
  });

  await writeAuditLog(prisma, {
    actor: { id: auth.user.id, name: auth.user.name },
    action: "DELETE_ASSIGNMENT",
    targetType: "TeacherStudentAssignment",
    targetId: assignment.id,
    summary: `管理员解除了老师 ${existing.teacherId} 与学生 ${existing.studentId} 的负责关系`,
    ip: getClientIp(request),
  });

  return NextResponse.json({ success: true, data: { assignment } });
}
