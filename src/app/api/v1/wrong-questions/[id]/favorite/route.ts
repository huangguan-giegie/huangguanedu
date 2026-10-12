// POST /api/v1/wrong-questions/:id/favorite：收藏或取消收藏
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.favorite !== "boolean") {
    return jsonError(400, "INVALID_INPUT", "favorite 必须是布尔值");
  }

  const question = await prisma.wrongQuestion.findUnique({
    where: { id },
    select: { id: true, studentId: true, deletedAt: true, student: { select: { familyAccount: { select: { userId: true } } } } },
  });
  if (!question || question.deletedAt) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }

  let allowed = auth.user.role === "ADMIN";
  if (auth.user.role === "FAMILY") {
    allowed = question.student.familyAccount.userId === auth.user.id;
  } else if (auth.user.role === "TEACHER") {
    allowed = Boolean(await prisma.teacherStudentAssignment.findFirst({
      where: { studentId: question.studentId, endsAt: null, teacher: { userId: auth.user.id } },
      select: { id: true },
    }));
  }
  if (!allowed) return jsonError(403, "FORBIDDEN", "无权操作该错题");

  if (body.favorite) {
    await prisma.wrongQuestionFavorite.upsert({
      where: { wrongQuestionId_userId: { wrongQuestionId: id, userId: auth.user.id } },
      create: { wrongQuestionId: id, userId: auth.user.id },
      update: {},
    });
  } else {
    await prisma.wrongQuestionFavorite.deleteMany({ where: { wrongQuestionId: id, userId: auth.user.id } });
  }

  return NextResponse.json({ success: true, data: { wrongQuestionId: id, isFavorite: body.favorite } });
}
