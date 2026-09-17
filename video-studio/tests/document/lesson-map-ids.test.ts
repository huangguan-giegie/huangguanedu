import { describe, expect, it } from "vitest";
import { mapLessonMapToVideoBriefs } from "../../src/document/lesson-map.js";

describe("VideoBrief 唯一 ID", () => {
  it("为拼音化后重名的知识点追加序号", () => {
    const briefs = mapLessonMapToVideoBriefs({
      id: "geometry",
      title: "几何",
      coreKnowledge: ["same", "same", "平行线"],
      theorems: [],
      examples: [],
    });
    expect(briefs.map((brief) => brief.id)).toEqual([
      "geometry-same-1",
      "geometry-same-2",
      "geometry-xian",
    ]);
  });

  it("为过长知识点 ID 限制目录名长度并保持确定性", () => {
    const knowledge = "全等三角形的判定与性质以及边角边角边角边角边角边角边角边角边角边角边角边角边角";
    const input = { id: "lesson-map", title: "几何", coreKnowledge: [knowledge], theorems: [], examples: [] };
    const first = mapLessonMapToVideoBriefs(input)[0]!.id;
    const second = mapLessonMapToVideoBriefs(input)[0]!.id;

    expect(first.length).toBeLessThanOrEqual(72);
    expect(first).toBe(second);
    expect(first).toMatch(/-[a-z0-9]{7}$/u);
  });
});
