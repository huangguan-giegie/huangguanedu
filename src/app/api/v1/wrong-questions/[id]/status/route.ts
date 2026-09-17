// PATCH /api/v1/wrong-questions/:id/status：标记已理解/仍不会
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../../lib/csrf";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const mastered = body?.mastered;
  if (typeof mastered !== "boolean") {
    return jsonError(400, "INVALID_INPUT", "mastered 必须是布尔值");
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  const wrongQuestion = await prisma.wrongQuestion.findUnique({
    where: { id },
  });
  if (!wrongQuestion || wrongQuestion.deletedAt) {
    return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
  }
  if (wrongQuestion.studentId !== familyAccount?.student?.id) {
    return jsonError(403, "FORBIDDEN", "只能操作自己的错题");
  }

  const updated = await prisma.wrongQuestion.update({
    where: { id },
    data: { mastered, lastReviewedAt: new Date() },
  });
  return NextResponse.json({ success: true, data: { mastered: updated.mastered } });
}
