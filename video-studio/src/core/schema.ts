import { z } from "zod";

export const lessonSchema = z.object({
  topic: z.string().optional(),
  title: z.string().optional(),
  grade: z.string().optional(),
  question: z.string().min(1, "question 不能为空").optional(),
  answer: z.string().optional(),
  solution: z.string().optional(),
  imagePath: z.string().optional(),
  targetDurationSeconds: z.number().int().min(150, "目标时长不能少于 150 秒").max(210, "目标时长不能超过 210 秒").default(180),
  hook: z.string().optional(),
  cta: z.string().optional(),
  equationSteps: z.array(z.string().min(1)).min(2).optional(),
});

export const sceneKindSchema = z.enum(["title", "question", "solution", "answer"]);
export const sceneSchema = z.object({
  kind: sceneKindSchema,
  text: z.string(),
  imagePath: z.string().optional(),
});
export const storyboardSchema = z.object({
  version: z.literal(1),
  scenes: z.array(sceneSchema),
});

export const runPathsSchema = z.object({
  root: z.string(),
  lesson: z.string(),
  storyboard: z.string(),
  audio: z.string(),
  preview: z.string(),
  render: z.string(),
  review: z.string(),
});

export const runSchema = z.object({
  id: z.string(),
  paths: runPathsSchema,
});
