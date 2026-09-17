// POST /api/v1/teacher/wrong-questions/:id/merge：合并重复错题到目标题
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../../lib/auth";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { assertStateChangeAllowed } from "../../../../../../../lib/csrf";
import { prisma } from "../../../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../../../lib/http";
import {
  mergeWrongQuestionsTx,
  WrongQuestionError,
} from "../../../../../../../lib/wrong-question";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["TEACHER", "ADMIN"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  if (!targetId) {
    return jsonError(400, "INVALID_INPUT", "targetId 不能为空");
  }

  // 老师只能合并自己负责学生的错题
  if (auth.user.role === "TEACHER") {
    const source = await prisma.wrongQuestion.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            teacherAssignments: { include: { teacher: true } },
          },
        },
      },
    });
    if (!source || source.deletedAt) {
      return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
    }
    const isAssigned = source.student.teacherAssignments.some(
      (a) => a.endsAt === null && a.teacher.userId === auth.user.id,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "只能合并自己负责学生的错题");
    }
  }

  try {
    await mergeWrongQuestionsTx(prisma, id, targetId);
    await writeAuditLog(prisma, {
      actor: { id: auth.user.id, name: auth.user.name },
      action: "MERGE_WRONG_QUESTION",
      targetType: "WrongQuestion",
      targetId,
      summary: `将错题 ${id} 合并到 ${targetId}`,
      ip: getClientIp(request),
    });
    return NextResponse.json({
      success: true,
      data: { sourceId: id, targetId },
    });
  } catch (error) {
    if (error instanceof WrongQuestionError) {
      return jsonError(error.status, error.code, error.message);
    }
    throw error;
  }
}
