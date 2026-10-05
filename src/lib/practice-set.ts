import type { Prisma, PrismaClient } from "../generated/prisma/client";

import { generatePracticeAi } from "./practice-ai";
import { seedMasteryFromWrongQuestions } from "./mastery";

export class PracticeSetError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PracticeSetError";
  }
}

export interface GeneratePracticeSetInput {
  studentId: string;
  count: number;
  wrongQuestionIds?: string[];
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  adaptive?: boolean;
}

export async function generatePracticeSetTx(
  prisma: PrismaClient,
  input: GeneratePracticeSetInput,
) {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) {
    throw new PracticeSetError(404, "STUDENT_NOT_FOUND", "学生不存在");
  }

  let adaptivePoints: string[] = [];
  if (input.adaptive && !input.wrongQuestionIds?.length) {
    await seedMasteryFromWrongQuestions(prisma, input.studentId);
    const now = new Date();
    const mastery = await prisma.knowledgeMastery.findMany({
      where: { studentId: input.studentId, subject: "MATH" },
      orderBy: [{ nextReviewAt: "asc" }, { masteryScore: "asc" }],
      take: 8,
    });
    adaptivePoints = mastery
      .filter((item) => !item.nextReviewAt || item.nextReviewAt <= now || item.masteryScore < 75)
      .slice(0, 5)
      .map((item) => item.knowledgePoint);
    if (adaptivePoints.length === 0) {
      adaptivePoints = mastery.slice(0, 5).map((item) => item.knowledgePoint);
    }
  }

  const wrongQuestionWhere: Prisma.WrongQuestionWhereInput = {
    studentId: input.studentId,
    subject: "MATH",
    deletedAt: null,
    status: { in: ["PUBLISHED", "REVIEWED"] },
    ...(input.wrongQuestionIds?.length ? { id: { in: input.wrongQuestionIds } } : {}),
    ...(adaptivePoints.length
      ? { knowledgePointRecords: { some: { knowledgePoint: { in: adaptivePoints } } } }
      : {}),
  };
  let wrongQuestions = await prisma.wrongQuestion.findMany({
    where: wrongQuestionWhere,
    orderBy: { updatedAt: "desc" },
    take: input.wrongQuestionIds?.length ?? 20,
    include: { knowledgePointRecords: true },
  });
  if (input.adaptive && wrongQuestions.length === 0 && adaptivePoints.length > 0) {
    wrongQuestions = await prisma.wrongQuestion.findMany({
      where: {
        studentId: input.studentId,
        subject: "MATH",
        deletedAt: null,
        status: { in: ["PUBLISHED", "REVIEWED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { knowledgePointRecords: true },
    });
  }
  if (input.wrongQuestionIds?.length && wrongQuestions.length !== input.wrongQuestionIds.length) {
    throw new PracticeSetError(404, "WRONG_QUESTION_NOT_FOUND", "部分所选数学错题不存在或已失效");
  }

  const pointCount = new Map<string, number>();
  for (const item of wrongQuestions) {
    for (const record of item.knowledgePointRecords) {
      pointCount.set(
        record.knowledgePoint,
        (pointCount.get(record.knowledgePoint) ?? 0) + 1,
      );
    }
  }
  const frequencyPoints = [...pointCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([point]) => point);
  const weakKnowledgePoints = adaptivePoints.length ? adaptivePoints : frequencyPoints;

  const wrongQuestionSamples = wrongQuestions
    .map((item) => item.recognizedQuestion)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);

  const generated = await generatePracticeAi({
    grade: student.grade,
    weakKnowledgePoints,
    wrongQuestionSamples,
    count: input.count,
    ...(input.difficulty ? { difficulty: input.difficulty } : {}),
  });

  return prisma.practiceSet.create({
    data: {
      studentId: input.studentId,
      title: generated.title,
      mode: input.adaptive ? "ADAPTIVE_REVIEW" : input.wrongQuestionIds?.length ? "SELECTED_WRONG_QUESTIONS" : "TARGETED",
      questions: {
        create: generated.questions.map((question) => ({
          question: question.question,
          answer: question.answer,
          explanation: question.explanation,
          difficulty: question.difficulty ?? input.difficulty ?? "MEDIUM",
          knowledgePoints: question.knowledgePoints?.length
            ? question.knowledgePoints
            : weakKnowledgePoints.slice(0, 3),
          sourceWrongQuestionIds: wrongQuestions.map((item) => item.id).slice(0, 10),
        })),
      },
    },
    include: { student: true, questions: true },
  });
}
