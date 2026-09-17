// Qwen 结构化分析结果的 Zod 校验 schema
// 有学生演算过程时必填过程字段；没有则为 null，不得臆测
import { z } from "zod";

export const QuestionAnalysisSchema = z.object({
  recognizedQuestion: z.string(),
  subject: z.enum(["MATH", "ENGLISH"]),
  questionType: z.string(),
  studentWorkDetected: z.boolean(),
  studentWorkTranscription: z.string().nullable(),
  studentApproach: z.string().nullable(),
  firstErrorStep: z.string().nullable(),
  misconception: z.string().nullable(),
  whatStudentDidWell: z.string().nullable(),
  thinkingHint: z.string(),
  correctSteps: z.array(z.string()),
  finalAnswer: z.string(),
  errorCauses: z.array(z.string()),
  knowledgePoints: z.array(z.string()),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "UNKNOWN"]),
  aiConfidence: z.number().min(0).max(1),
  needsTeacherReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  remedialPractice: z.array(z.string()),
});

export type QuestionAnalysis = z.infer<typeof QuestionAnalysisSchema>;
