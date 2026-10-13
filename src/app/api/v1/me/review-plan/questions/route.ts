import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireRole } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";

// GET /api/v1/me/review-plan/questions?knowledgePoints=A,B,C
// 按知识点反查当前学生的错题，供「智能复习」页挑题出练习集。
// 出题接口要求显式传 wrongQuestionIds（1-20），而复习计划给的是知识点，
// 这里补上从知识点到错题的那一跳——两者的唯一连接就是 WrongQuestionKnowledgePoint。
const QuerySchema = z.object({
  knowledgePoints: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) return auth.error;

  const parsed = QuerySchema.safeParse({
    knowledgePoints: request.nextUrl.searchParams.get("knowledgePoints") ?? "",
    limit: request.nextUrl.searchParams.get("limit") ?? 20,
  });
  if (!parsed.success) {
    return jsonError(400, "INVALID_INPUT", "请提供 knowledgePoints（逗号分隔，1-20 个）与可选的 limit");
  }

  const points = [...new Set(parsed.data.knowledgePoints.split(",").map((x) => x.trim()).filter(Boolean))];
  if (points.length === 0 || points.length > 20) {
    return jsonError(400, "INVALID_INPUT", "知识点需为 1-20 个");
  }

  const family = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!family?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前家庭账号未绑定学生");
  }

  const rows: { wrongQuestionId: string }[] = await prisma.wrongQuestionKnowledgePoint.findMany({
    where: {
      knowledgePoint: { in: points },
      wrongQuestion: { studentId: family.student.id, deletedAt: null },
    },
    select: { wrongQuestionId: true },
    take: parsed.data.limit,
  });

  return NextResponse.json({
    success: true,
    data: {
      // 去重：同一道错题可能命中多个知识点
      wrongQuestionIds: [...new Set(rows.map((row) => row.wrongQuestionId))],
      matchedFrom: points.length,
    },
  });
}