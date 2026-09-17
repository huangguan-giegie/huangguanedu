import type { Lesson, SceneKind, Storyboard } from "./types.js";

export const SCENE_KINDS: readonly SceneKind[] = ["title", "question", "solution", "answer"];

export function createStoryboard(lesson: Lesson): Storyboard {
  return {
    version: 1,
    scenes: [
      { kind: "title", text: lesson.title ?? lesson.topic ?? "课程讲解" },
      { kind: "question", text: lesson.question ?? "请围绕这个知识点设计一道典型题。", imagePath: lesson.imagePath },
      { kind: "solution", text: lesson.solution ?? "" },
      { kind: "answer", text: lesson.answer ?? "" },
    ],
  };
}
