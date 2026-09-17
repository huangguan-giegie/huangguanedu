import { z } from "zod";

const text = z.string().trim().min(1, "文本不能为空");
const textList = z.array(text);

export const proofPlanSchema = z.object({
  premise: text.optional(),
  statement: text.optional(),
  conditions: textList,
  construction: textList,
  reasoningSteps: textList,
  conclusion: text,
}).refine((value) => Boolean(value.premise || value.statement), {
  message: "证明必须包含 premise 或 statement",
  path: ["premise"],
});

export const solutionPlanSchema = z.object({
  name: text,
  trigger: text,
  idea: text,
  steps: textList,
  conclusion: text,
});

export const teachingPlanSchema = z.object({
  hook: text,
  intuition: textList,
  proof: proofPlanSchema.optional(),
  solutions: z.array(solutionPlanSchema),
  mistakes: textList,
  summary: text,
  cta: text.optional(),
});

export const lessonExampleSchema = z.object({
  statement: text,
  keyInformation: textList,
  candidateSolutions: z.array(solutionPlanSchema),
  sourcePage: z.number().int().positive().optional(),
});

export const lessonMapSchema = z.object({
  title: text,
  coreKnowledge: textList,
  theorems: z.array(proofPlanSchema),
  examples: z.array(lessonExampleSchema),
});

export const videoBriefSchema = z.object({
  id: text,
  title: text,
  coreKnowledge: textList,
  theorem: z.object({
    statement: text,
    conditions: textList,
    conclusion: text,
  }).optional(),
  example: z.object({
    statement: text,
    sourcePage: z.number().int().positive().optional(),
  }).optional(),
  targetDurationSeconds: z.number().int().min(90).max(195),
});

export type TeachingPlanInput = z.input<typeof teachingPlanSchema>;
