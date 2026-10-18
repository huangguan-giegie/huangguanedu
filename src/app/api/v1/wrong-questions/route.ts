// 上传一道错题（英语长文可多图）以及按角色查看、筛选错题。
import { after, NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../lib/csrf";
import { prisma } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";
import { ImageError, isAllowedMime, MAX_IMAGE_BYTES, normalizeImage } from "../../../../lib/image";
import { getStorage } from "../../../../lib/storage";
import { loadConfig } from "../../../../lib/config";
import { processAnalysisJobs } from "../../../../lib/analysis-worker";
import { WrongQuestionError } from "../../../../lib/wrong-question";
import { wrongQuestionWhere } from "../../../../lib/wrong-question-query";
import { qwenModelForMode, type QwenModelMode } from "../../../../lib/qwen-model";

export const maxDuration = 240;
const IMAGE_RETENTION_DAYS = 91;
const MAX_ENGLISH_IMAGES = 6;
const WEEKLY_WRONG_QUESTION_QUOTA = 100;

// Next.js after() requires an active request scope. If unavailable (e.g. unit
// tests or alternate runtimes), leave the durable PENDING job for the worker.
function scheduleAnalysis(): void {
  try {
    after(() => processAnalysisJobs(prisma, 1).then(() => undefined));
  } catch (error) {
    console.warn("[analysis] Deferred scheduling unavailable; queued job will be handled by worker", error instanceof Error ? error.name : "unknown");
  }
}


function currentWeekStart(): Date {
  const utc8 = new Date(Date.now() + 8 * 3600000);
  const daysSinceMonday = (utc8.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(utc8.getUTCFullYear(), utc8.getUTCMonth(), utc8.getUTCDate() - daysSinceMonday) - 8 * 3600000);
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) return auth.error;
  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) return csrfError;
  const account = await prisma.familyAccount.findUnique({ where: { userId: auth.user.id }, include: { student: true } });
  if (!account?.student) return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  const studentId = account.student.id;
  const used = await prisma.wrongQuestion.count({ where: { studentId, deletedAt: null, createdAt: { gte: currentWeekStart() } } });
  if (used >= WEEKLY_WRONG_QUESTION_QUOTA) return jsonError(429, "WEEKLY_QUOTA_EXCEEDED", "本周错题额度已用完（每周 100 题），请下周再试");
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError(400, "INVALID_FORM", "请求必须是 multipart/form-data"); }
  const subject = form.get("subject");
  if (subject !== "MATH" && subject !== "ENGLISH") return jsonError(400, "INVALID_SUBJECT", "请选择学科（数学或英语）");
  const requestedMode = form.get("modelMode");
  const requestedModel = form.get("model");
  let model: string | undefined;
  if (requestedMode !== null) {
    if (requestedMode !== "STANDARD" && requestedMode !== "COMPLEX") return jsonError(400, "INVALID_MODEL_MODE", "请选择有效的 AI 模式");
    model = qwenModelForMode(requestedMode as QwenModelMode);
  } else {
    if (requestedModel && requestedModel !== "qwen-vl-max" && requestedModel !== "qwen-vl-plus" && requestedModel !== "qwen3.7-plus" && requestedModel !== "qwen3.8-max") return jsonError(400, "INVALID_MODEL", "请选择有效的识别模型");
    // 兼容旧客户端的模型参数；新客户端使用 modelMode 明确选择模型。
    model = requestedModel && requestedModel !== "qwen3.8-max"
      ? loadConfig().qwen.model
      : typeof requestedModel === "string" ? requestedModel : undefined;
  }
  const files = form.getAll("image");
  const maxFiles = subject === "ENGLISH" ? MAX_ENGLISH_IMAGES : 1;
  if (!files.length || files.length > maxFiles) return jsonError(400, "INVALID_FILE_COUNT", subject === "ENGLISH" ? "英语题请上传 1 至 6 张图片" : "数学题每次请上传一张图片");
  for (const file of files) {
    if (!(file instanceof File)) return jsonError(400, "INVALID_FILE", "image 字段必须是文件");
    if (!isAllowedMime(file.type)) return jsonError(400, "INVALID_FILE_TYPE", "仅支持 JPG/JPEG/PNG 图片");
    if (file.size > MAX_IMAGE_BYTES) return jsonError(400, "FILE_TOO_LARGE", "每张图片不能超过 8MB");
  }
  const storage = getStorage();
  const images: Array<{ filePath: string; mimeType: string; sizeBytes: number }> = [];
  try {
    for (const file of files as File[]) {
      const normalized = await normalizeImage(Buffer.from(await file.arrayBuffer()));
      const filePath = await storage.save(normalized.buffer, { extension: normalized.extension, subdir: `questions/${studentId}` });
      images.push({ filePath, mimeType: normalized.mimeType, sizeBytes: normalized.buffer.length });
    }
  } catch (error) {
    await Promise.all(images.map((image) => storage.delete(image.filePath).catch(() => undefined)));
    if (error instanceof ImageError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "IMAGE_PROCESS_FAILED", "图片处理或保存失败，请稍后重试");
  }
  try {
    const now = Date.now();
    const expiresAt = new Date(now + IMAGE_RETENTION_DAYS * 24 * 3600000);
    const result = await prisma.$transaction(async (tx) => {
      // 同一学生并发上传时串行核对额度，避免两次请求同时绕过上限。
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
      const count = await tx.wrongQuestion.count({ where: { studentId, deletedAt: null, createdAt: { gte: currentWeekStart() } } });
      if (count >= WEEKLY_WRONG_QUESTION_QUOTA) throw new WrongQuestionError(429, "WEEKLY_QUOTA_EXCEEDED", "本周错题额度已用完（每周 100 题），请下周再试");
      const wrongQuestion = await tx.wrongQuestion.create({ data: { studentId, subject, status: "PROCESSING" } });
      const imageRecords = [];
      for (const [index, image] of images.entries()) imageRecords.push(await tx.rawQuestionImage.create({ data: { ...image, studentId, wrongQuestionId: wrongQuestion.id, expiresAt, reviewStatus: "NORMAL", createdAt: new Date(now + index) } }));
      const job = await tx.analysisJob.create({ data: { wrongQuestionId: wrongQuestion.id, status: "PENDING", ...(model ? { modelOverride: model as string } : {}) } });
      return { wrongQuestion, imageRecords, job };
    });
    // 若独立 worker 未启用，上传接口仍可在响应后启动一个分析任务。
    // 数据库锁保证并行 worker 不会重复处理同一题。
    scheduleAnalysis();
    return NextResponse.json({ success: true, data: { wrongQuestionId: result.wrongQuestion.id, imageId: result.imageRecords[0].id, imageIds: result.imageRecords.map((image) => image.id), jobId: result.job.id, status: "PROCESSING" } });
  } catch (error) {
    await Promise.all(images.map((image) => storage.delete(image.filePath).catch(() => undefined)));
    if (error instanceof WrongQuestionError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "QUESTION_CREATE_FAILED", "错题创建失败，请稍后重试");
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  try {
    const where = await wrongQuestionWhere(prisma, auth.user, params);
    const page = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page")) || 1)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(params.get("pageSize")) || 20)));
    const [total, items] = await Promise.all([
      prisma.wrongQuestion.count({ where }),
      prisma.wrongQuestion.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { student: { select: { name: true } }, knowledgePointRecords: true, favorites: { where: { userId: auth.user.id }, select: { id: true } } } }),
    ]);
    // 旧版部署缺少独立 worker 时，客户端的 5 秒轮询也能继续推动待分析队列。
    if (items.some((item) => item.status === "PROCESSING")) {
      scheduleAnalysis();
    }
    return NextResponse.json({ success: true, data: { total, page, pageSize, items: items.map((w) => ({ id: w.id, studentId: w.studentId, studentName: w.student.name, subject: w.subject, recognizedQuestion: w.recognizedQuestion, knowledgePoints: w.knowledgePointRecords.map((record) => record.knowledgePoint), mastered: w.mastered, status: w.status, isAiGenerated: w.isAiGenerated, isTeacherReviewed: w.isTeacherReviewed, isFavorite: w.favorites.length > 0, firstSeenAt: w.firstSeenAt, lastReviewedAt: w.lastReviewedAt, updatedAt: w.updatedAt })) } });
  } catch (error) {
    if (error instanceof WrongQuestionError) return jsonError(error.status, error.code, error.message);
    throw error;
  }
}
