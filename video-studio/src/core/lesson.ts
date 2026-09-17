import { load } from "js-yaml";
import { lessonSchema } from "./schema.js";
import type { Lesson } from "./types.js";

export { lessonSchema } from "./schema.js";

export function normalizeLesson(input: unknown): Lesson {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("lesson 输入无效：必须是对象");
  }
  const fields = ["topic", "title", "grade", "question", "answer", "solution", "imagePath", "hook", "cta"] as const;
  const normalized = { ...(input as Record<string, unknown>) };
  for (const field of fields) {
    if (normalized[field] !== undefined && normalized[field] !== null) {
      normalized[field] = String(normalized[field]);
    }
  }
  if (normalized.targetDurationSeconds !== undefined && normalized.targetDurationSeconds !== null) {
    const targetDurationSeconds = Number(normalized.targetDurationSeconds);
    if (Number.isFinite(targetDurationSeconds)) normalized.targetDurationSeconds = targetDurationSeconds;
  }
  if (Array.isArray(normalized.equationSteps)) {
    normalized.equationSteps = normalized.equationSteps.map(String).filter((step) => step.trim());
  }
  const result = lessonSchema.safeParse(normalized);
  if (!result.success) throw new Error("lesson 输入无效：字段格式不正确");
  return result.data;
}

export function parseLessonText(text: string, fileName: string): Lesson {
  let value: unknown;
  try {
    value = fileName.toLowerCase().endsWith(".json") ? JSON.parse(text) : load(text);
  } catch {
    throw new Error("lesson 文件格式无效");
  }
  return normalizeLesson(value);
}
