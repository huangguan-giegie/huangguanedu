import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "../../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../../lib/csrf";
import { prisma } from "../../../../../lib/db";
import { getClientIp, jsonError } from "../../../../../lib/http";
import { allowedPracticeStudents, runPracticeGenerationJob } from "../../../../../lib/practice-set";
import { generatePracticeSetTx, PracticeSetError } from "../../../../../lib/practice-set-targeted";
import { PracticeAiError } from "../../../../../lib/practice-ai";
import { writeAuditLog } from "../../../../../lib/audit";

export const maxDuration = 240;
const InputSchema = z.object({ studentId: z.string().trim().min(1).optional(), wrongQuestionIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(), count: z.number().int().min(3).max(5).optional(), adaptive: z.boolean().optional(), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional() });

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;
  const input = InputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonError(400, "INVALID_INPUT", "请选择 1 至 20 道错题，难度须为 EASY、MEDIUM 或 HARD");
  const students = await allowedPracticeStudents(prisma, auth.user);
  const studentId = input.data.studentId ?? (auth.user.role === "FAMILY" ? students[0]?.id : undefined);
  if (!studentId) return jsonError(400, "STUDENT_NOT_FOUND", "请先选择已关联的学生");
  if (!students.some((s) => s.id === studentId)) return jsonError(403, "FORBIDDEN", "只能为自己可见的学生生成模拟题");
  // 保留 PR #9 的按薄弱知识点/题数生成入口，指定错题的现有页面继续异步生成。
  if (!input.data.wrongQuestionIds || input.data.count !== undefined || input.data.adaptive) {
    try {
      const set = await generatePracticeSetTx(prisma, { ...input.data, studentId, count: input.data.count ?? 5 });
      await writeAuditLog(prisma, {
        actor: { id: auth.user.id, name: auth.user.name }, action: "GENERATE_PRACTICE_SET",
        targetType: "PracticeSet", targetId: set.id, summary: `生成数学模拟题组：${set.title}`, ip: getClientIp(request),
      });
      return NextResponse.json({ success: true, data: { id: set.id, studentId: set.studentId, studentName: set.student.name, title: set.title, questions: set.questions, createdAt: set.createdAt } });
    } catch (error) {
      if (error instanceof PracticeSetError) return jsonError(error.status, error.code, error.message);
      if (error instanceof PracticeAiError) return jsonError(error.retryable ? 503 : 502, "PRACTICE_AI_FAILED", error.message);
      throw error;
    }
  }
  const ids = [...new Set(input.data.wrongQuestionIds)];
  const questions = await prisma.wrongQuestion.findMany({ where: { id: { in: ids }, studentId, deletedAt: null, status: { in: ["PUBLISHED", "REVIEWED"] } }, select: { recognizedQuestion: true, subject: true } });
  if (questions.length !== ids.length || questions.some((q) => !q.recognizedQuestion?.trim())) return jsonError(404, "WRONG_QUESTION_NOT_FOUND", "所选错题尚未完成识别或已失效，请刷新后重试");
  if (new Set(questions.map((q) => q.subject)).size > 1) return jsonError(400, "MIXED_SUBJECTS", "请分别生成数学或英语模拟题");
  // 同一用户仅保留一个进行中任务，防止重复点击造成重复出题。
  const active = await prisma.practiceGenerationJob.findFirst({ where: { requestedById: auth.user.id, status: { in: ["PENDING", "PROCESSING"] }, updatedAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } }, orderBy: { createdAt: "desc" } });
  if (active) return NextResponse.json({ success: true, data: { jobId: active.id, studentId: active.studentId, status: active.status } }, { status: 202 });
  const job = await prisma.practiceGenerationJob.create({ data: { studentId, requestedById: auth.user.id, wrongQuestionIds: ids, difficulty: input.data.difficulty ?? null } });
  after(() => runPracticeGenerationJob(prisma, job.id));
  return NextResponse.json({ success: true, data: { jobId: job.id, studentId, status: job.status } }, { status: 202 });
}
