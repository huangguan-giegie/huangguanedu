import { describe, expect, it } from "vitest";
import { SCENE_KINDS, createStoryboard } from "../../src/core/storyboard";
import type { Lesson } from "../../src/core/types";

describe("storyboard", () => {
  it("使用稳定的 scene kind 枚举生成固定场景顺序", () => {
    const lesson: Lesson = { topic: "分数", question: "1/2 + 1/2 = ?" };
    const storyboard = createStoryboard(lesson);

    expect(SCENE_KINDS).toEqual(["title", "question", "solution", "answer"]);
    expect(storyboard.scenes.map((scene) => scene.kind)).toEqual(SCENE_KINDS);
  });
});
