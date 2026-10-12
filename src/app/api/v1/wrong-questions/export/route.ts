// 导出当前筛选下的错题，与列表共用角色权限。
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { WrongQuestionError } from "../../../../../lib/wrong-question";
import { wrongQuestionWhere } from "../../../../../lib/wrong-question-query";
import { buildExportFilename, buildWrongQuestionsMarkdown, toExportableWrongQuestion } from "../../../../../lib/wrong-question-export";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  try {
    const where = await wrongQuestionWhere(prisma, auth.user, params);
    const total = await prisma.wrongQuestion.count({ where });
    const items = await prisma.wrongQuestion.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 500, include: { knowledgePointRecords: true } });
    const subject = params.get("subject");
    const content = buildWrongQuestionsMarkdown({ items: items.map(toExportableWrongQuestion), subject: subject === "MATH" || subject === "ENGLISH" ? subject : undefined, from: params.get("from") ?? undefined });
    return NextResponse.json({ success: true, data: { content, filename: buildExportFilename(), count: items.length, total, truncated: total > items.length } });
  } catch (error) {
    if (error instanceof WrongQuestionError) return jsonError(error.status, error.code, error.message);
    throw error;
  }
}
