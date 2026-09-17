// GET/POST /api/v1/wrong-questions：家庭端错题列表与上传单道错题图片
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireRole } from "../../../../lib/auth";
import { assertStateChangeAllowed } from "../../../../lib/csrf";
import { prisma } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";
import {
  ImageError,
  isAllowedMime,
  MAX_IMAGE_BYTES,
  normalizeImage,
} from "../../../../lib/image";
import { getStorage } from "../../../../lib/storage";

const IMAGE_RETENTION_HOURS = 24;

// POST：上传单道错题图片 -> 规范化 -> 临时图 -> WrongQuestion + AnalysisJob -> PROCESSING
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const csrfError = assertStateChangeAllowed(request);
  if (csrfError) {
    return csrfError;
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!familyAccount?.student) {
    return jsonError(404, "STUDENT_NOT_FOUND", "当前账户未绑定学生");
  }
  const student = familyAccount.student;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "INVALID_FORM", "请求必须是 multipart/form-data");
  }

  const subjectRaw = String(formData.get("subject") ?? "");
  const subject =
    subjectRaw === "MATH" || subjectRaw === "ENGLISH" ? subjectRaw : null;
  if (!subject) {
    return jsonError(400, "INVALID_SUBJECT", "请选择学科（数学或英语）");
  }

  const files = formData.getAll("image");
  if (files.length !== 1) {
    return jsonError(400, "INVALID_FILE_COUNT", "每次仅上传一道题的图片");
  }
  const file = files[0];
  if (!(file instanceof File)) {
    return jsonError(400, "INVALID_FILE", "image 字段必须是文件");
  }
  if (!isAllowedMime(file.type)) {
    return jsonError(400, "INVALID_FILE_TYPE", "仅支持 JPG/JPEG/PNG 图片");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(400, "FILE_TOO_LARGE", "图片不能超过 8MB");
  }

  const original = Buffer.from(await file.arrayBuffer());
  let normalized: { buffer: Buffer; mimeType: string; extension: string };
  try {
    normalized = await normalizeImage(original);
  } catch (error) {
    if (error instanceof ImageError) {
      return jsonError(error.status, error.code, error.message);
    }
    return jsonError(400, "IMAGE_PROCESS_FAILED", "图片处理失败，请换一张图片");
  }

  const relativePath = await getStorage().save(normalized.buffer, {
    extension: normalized.extension,
    subdir: "questions",
  });

  const expiresAt = new Date(
    Date.now() + IMAGE_RETENTION_HOURS * 60 * 60 * 1000,
  );
  const result = await prisma.$transaction(async (tx) => {
    const wrongQuestion = await tx.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject,
        status: "PROCESSING",
      },
    });
    const imageRecord = await tx.rawQuestionImage.create({
      data: {
        studentId: student.id,
        wrongQuestionId: wrongQuestion.id,
        filePath: relativePath,
        mimeType: normalized.mimeType,
        sizeBytes: normalized.buffer.length,
        expiresAt,
        reviewStatus: "NORMAL",
      },
    });
    const job = await tx.analysisJob.create({
      data: {
        wrongQuestionId: wrongQuestion.id,
        status: "PENDING",
      },
    });
    return { wrongQuestion, imageRecord, job };
  });

  return NextResponse.json({
    success: true,
    data: {
      wrongQuestionId: result.wrongQuestion.id,
      imageId: result.imageRecord.id,
      jobId: result.job.id,
      status: "PROCESSING",
    },
  });
}

// GET：家庭端错题列表（按学科/知识点/mastered 筛选）

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY"]);
  if ("error" in auth) {
    return auth.error;
  }

  const familyAccount = await prisma.familyAccount.findUnique({
    where: { userId: auth.user.id },
    include: { student: true },
  });
  if (!familyAccount?.student) {
    return NextResponse.json({ success: true, data: { items: [], total: 0 } });
  }

  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject");
  const knowledgePoint = searchParams.get("knowledgePoint")?.trim();
  const mastered = searchParams.get("mastered");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20),
  );

  const where: Record<string, unknown> = {
    studentId: familyAccount.student.id,
    deletedAt: null,
    status: { in: ["PUBLISHED", "REVIEWED"] },
  };
  if (subject === "MATH" || subject === "ENGLISH") {
    where.subject = subject;
  }
  if (mastered === "true" || mastered === "false") {
    where.mastered = mastered === "true";
  }
  if (knowledgePoint) {
    where.knowledgePointRecords = {
      some: { knowledgePoint: { contains: knowledgePoint } },
    };
  }

  const [total, items] = await Promise.all([
    prisma.wrongQuestion.count({ where }),
    prisma.wrongQuestion.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { knowledgePointRecords: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      total,
      page,
      pageSize,
      items: items.map((w) => ({
        id: w.id,
        subject: w.subject,
        recognizedQuestion: w.recognizedQuestion,
        knowledgePoints: w.knowledgePointRecords.map((k) => k.knowledgePoint),
        mastered: w.mastered,
        status: w.status,
        isAiGenerated: w.isAiGenerated,
        isTeacherReviewed: w.isTeacherReviewed,
        firstSeenAt: w.firstSeenAt,
        lastReviewedAt: w.lastReviewedAt,
        updatedAt: w.updatedAt,
      })),
    },
  });
}
