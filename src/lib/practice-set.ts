import type { PrismaClient } from "../generated/prisma/client";

import { generatePracticeAi } from "./practice-ai";

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

  const wrongQuestions = await prisma.wrongQuestion.findMany({
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

  const pointCount = new Map<string, number>();
  for (const item of wrongQuestions) {
    for (const record of item.knowledgePointRecords) {
      pointCount.set(
        record.knowledgePoint,
        (pointCount.get(record.knowledgePoint) ?? 0) + 1,
      );
    }
  }
  const weakKnowledgePoints = [...pointCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([point]) => point);

  const wrongQuestionSamples = wrongQuestions
    .map((item) => item.recognizedQuestion)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);

  const generated = await generatePracticeAi({
    grade: student.grade,
    weakKnowledgePoints,
    wrongQuestionSamples,
    count: input.count,
  });

  return prisma.practiceSet.create({
    data: {
      studentId: input.studentId,
      title: generated.title,
      questions: {
        create: generated.questions.map((question) => ({
          question: question.question,
          answer: question.answer,
          explanation: question.explanation,
        })),
      },
    },
    include: { student: true, questions: true },
  });
}
