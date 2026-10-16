// 错题状态流转：学生反馈、老师审核、合并（事务）
import type { PrismaClient } from "../generated/prisma/client";
import { z } from "zod";
import { getStorage } from "./storage";

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends"
>;

export class WrongQuestionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const reviewSchema = z.object({
  recognizedQuestion: z.string().max(20000).optional(),
  finalAnswer: z.string().max(20000).optional(),
  correctSteps: z.array(z.string().max(20000)).max(200).optional(),
  thinkingHint: z.string().max(20000).optional(),
  errorCauses: z.array(z.string().max(20000)).max(100).optional(),
  knowledgePoints: z.array(z.string().min(1).max(200)).max(100).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "UNKNOWN"]).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  remedialPractice: z.array(z.string().max(20000)).max(100).optional(),
  teacherNote: z.string().max(20000).optional(),
  errorType: z.string().max(200).optional(),
  mastered: z.boolean().optional(),
});

/**
 * 学生反馈：
 * - ACCURATE：直接发布完整解答（无需老师审核），保留 AI 初步生成标记。
 * - NEEDS_REVIEW：进入老师复核队列，原图至少再保留 7 天。
 */
export async function studentFeedbackTx(
  prisma: PrismaClient,
  wrongQuestionId: string,
  feedback: "ACCURATE" | "NEEDS_REVIEW",
  now: Date = new Date(),
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const wrongQuestion = await tx.wrongQuestion.findUnique({
      where: { id: wrongQuestionId },
      include: { rawImages: true },
    });
    if (!wrongQuestion || wrongQuestion.deletedAt) {
      throw new WrongQuestionError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
    }
    if (wrongQuestion.status !== "PENDING_STUDENT_CONFIRMATION") {
      throw new WrongQuestionError(
        400,
        "INVALID_STATUS",
        "当前状态不允许学生反馈",
      );
    }

    if (feedback === "ACCURATE") {
      await tx.wrongQuestion.update({
        where: { id: wrongQuestionId },
        data: {
          status: "PUBLISHED",
          studentConfirmedAt: now,
          feedbackValue: "ACCURATE",
          // AI 初步生成标记保留，不标注老师已审核
          isTeacherReviewed: false,
        },
      });
    } else {
      await tx.wrongQuestion.update({
        where: { id: wrongQuestionId },
        data: {
          status: "NEEDS_REVIEW",
          studentConfirmedAt: now,
          feedbackValue: "NEEDS_REVIEW",
          needsTeacherReview: true,
        },
      });
      // 待复核至少保留 7 天，不能缩短多图上传原本的保留期限。
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      for (const image of wrongQuestion.rawImages) {
        await tx.rawQuestionImage.update({
          where: { id: image.id },
          data: {
            expiresAt: image.expiresAt > expiresAt ? image.expiresAt : expiresAt,
            reviewStatus: "AWAITING_REVIEW",
          },
        });
      }
    }
  });
}

/**
 * 老师审核：直接覆盖当前结构化字段（不保留旧版本），标记老师已审核，删除原图。
 * 校验老师确实负责该学生（管理员可审核全部）。
 */
export async function teacherReviewTx(
  prisma: PrismaClient,
  wrongQuestionId: string,
  data: {
    recognizedQuestion?: string;
    finalAnswer?: string;
    correctSteps?: string[];
    thinkingHint?: string;
    errorCauses?: string[];
    knowledgePoints?: string[];
    difficulty?: "EASY" | "MEDIUM" | "HARD" | "UNKNOWN";
    aiConfidence?: number;
    remedialPractice?: string[];
    teacherNote?: string;
    errorType?: string;
    mastered?: boolean;
  },
  actorId: string,
  now: Date = new Date(),
): Promise<void> {
  const parsed = reviewSchema.safeParse(data);
  if (!parsed.success) throw new WrongQuestionError(400, "INVALID_INPUT", "审核内容格式不正确，请检查文字、列表、难度和置信度");
  data = parsed.data;
  return prisma.$transaction(async (tx) => {
    const wrongQuestion = await tx.wrongQuestion.findUnique({
      where: { id: wrongQuestionId },
      include: {
        student: {
          include: {
            teacherAssignments: { include: { teacher: true } },
          },
        },
        rawImages: true,
      },
    });
    if (!wrongQuestion || wrongQuestion.deletedAt) {
      throw new WrongQuestionError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
    }
    if (wrongQuestion.status === "PROCESSING") throw new WrongQuestionError(400, "INVALID_STATUS", "请等待分析完成后再审核");

    const isAdmin = (await tx.user.findUnique({ where: { id: actorId } }))?.role === "ADMIN";
    const isAssignedTeacher = wrongQuestion.student.teacherAssignments.some(
      (a) => a.endsAt === null && a.teacher.userId === actorId,
    );
    if (!isAdmin && !isAssignedTeacher) {
      throw new WrongQuestionError(403, "FORBIDDEN", "只能审核自己负责学生的错题");
    }

    await tx.wrongQuestion.update({
      where: { id: wrongQuestionId },
      data: {
        status: "REVIEWED",
        isTeacherReviewed: true,
        needsTeacherReview: false,
        lastReviewedAt: now,
        ...(data.recognizedQuestion !== undefined
          ? { recognizedQuestion: data.recognizedQuestion }
          : {}),
        ...(data.finalAnswer !== undefined ? { finalAnswer: data.finalAnswer } : {}),
        ...(data.correctSteps !== undefined ? { correctSteps: data.correctSteps } : {}),
        ...(data.thinkingHint !== undefined ? { thinkingHint: data.thinkingHint } : {}),
        ...(data.errorCauses !== undefined ? { errorCauses: data.errorCauses } : {}),
        ...(data.knowledgePoints !== undefined ? { knowledgePoints: data.knowledgePoints } : {}),
        ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
        ...(data.aiConfidence !== undefined ? { aiConfidence: data.aiConfidence } : {}),
        ...(data.remedialPractice !== undefined
          ? { remedialPractice: data.remedialPractice }
          : {}),
        ...(data.teacherNote !== undefined ? { teacherNote: data.teacherNote } : {}),
        ...(data.errorType !== undefined ? { errorType: data.errorType } : {}),
        ...(data.mastered !== undefined ? { mastered: data.mastered } : {}),
      },
    });

    // 同步检索表，老师订正后知识点筛选与薄弱点统计立即生效。
    if (data.knowledgePoints !== undefined) {
      await tx.wrongQuestionKnowledgePoint.deleteMany({ where: { wrongQuestionId } });
      const points = [...new Set(data.knowledgePoints.map((point) => point.trim()).filter(Boolean))];
      if (points.length) await tx.wrongQuestionKnowledgePoint.createMany({ data: points.map((knowledgePoint) => ({ wrongQuestionId, knowledgePoint })) });
    }

    // 审核完成立即删除原图（文件 + 记录）
    for (const image of wrongQuestion.rawImages) {
      await tx.rawQuestionImage.update({
        where: { id: image.id },
        data: { deletedAt: now, reviewStatus: "REVIEWED" },
      });
      await getStorage().delete(image.filePath).catch(() => undefined);
    }
  });
}

/** 合并重复错题：把源题记录迁移到目标题，源题软删除 */
export async function mergeWrongQuestionsTx(
  prisma: PrismaClient,
  sourceId: string,
  targetId: string,
  now: Date = new Date(),
): Promise<void> {
  if (sourceId === targetId) {
    throw new WrongQuestionError(400, "INVALID_INPUT", "不能合并到自身");
  }
  return prisma.$transaction(async (tx) => {
    const source = await tx.wrongQuestion.findUnique({
      where: { id: sourceId },
      include: { student: true },
    });
    const target = await tx.wrongQuestion.findUnique({
      where: { id: targetId },
      include: { student: true },
    });
    if (!source || !target || source.deletedAt || target.deletedAt) {
      throw new WrongQuestionError(404, "WRONG_QUESTION_NOT_FOUND", "错题不存在");
    }
    if (source.studentId !== target.studentId) {
      throw new WrongQuestionError(400, "DIFFERENT_STUDENT", "只能合并同一学生的错题");
    }
    if (source.subject !== target.subject) throw new WrongQuestionError(400, "DIFFERENT_SUBJECT", "只能合并同一学科的错题");
    if (source.status === "PROCESSING" || target.status === "PROCESSING") throw new WrongQuestionError(400, "INVALID_STATUS", "请等待错题分析完成后再合并");

    // 迁移关联记录到目标
    await tx.wrongQuestionOccurrence.updateMany({
      where: { wrongQuestionId: sourceId },
      data: { wrongQuestionId: targetId },
    });
    await tx.studentAnswerAttempt.updateMany({
      where: { wrongQuestionId: sourceId },
      data: { wrongQuestionId: targetId },
    });
    const points = await tx.wrongQuestionKnowledgePoint.findMany({ where: { wrongQuestionId: sourceId }, select: { knowledgePoint: true } });
    if (points.length) await tx.wrongQuestionKnowledgePoint.createMany({ data: points.map(({ knowledgePoint }) => ({ wrongQuestionId: targetId, knowledgePoint })), skipDuplicates: true });
    await tx.wrongQuestionKnowledgePoint.deleteMany({ where: { wrongQuestionId: sourceId } });
    const favorites = await tx.wrongQuestionFavorite.findMany({ where: { wrongQuestionId: sourceId }, select: { userId: true } });
    if (favorites.length) await tx.wrongQuestionFavorite.createMany({ data: favorites.map(({ userId }) => ({ wrongQuestionId: targetId, userId })), skipDuplicates: true });
    await tx.wrongQuestionFavorite.deleteMany({ where: { wrongQuestionId: sourceId } });
    const mergedPoints = await tx.wrongQuestionKnowledgePoint.findMany({ where: { wrongQuestionId: targetId }, select: { knowledgePoint: true } });
    await tx.wrongQuestion.update({ where: { id: targetId }, data: { knowledgePoints: mergedPoints.map(({ knowledgePoint }) => knowledgePoint) } });
    // 原图重新关联（若有）
    await tx.rawQuestionImage.updateMany({
      where: { wrongQuestionId: sourceId },
      data: { wrongQuestionId: targetId },
    });
    // 分析任务不再处理源题
    await tx.analysisJob.updateMany({
      where: { wrongQuestionId: sourceId },
      data: { status: "FAILED", lastError: "已合并到目标错题" },
    });
    // 源题软删除
    await tx.wrongQuestion.update({
      where: { id: sourceId },
      data: { deletedAt: now, status: "REVIEWED" },
    });
  });
}
