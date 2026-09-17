import { describe, expect, it } from "vitest";
import {
  batchVideoBriefs,
  lessonMapSchema,
  mapLessonMapToVideoBriefs,
  type LessonMap,
} from "../../src/document/lesson-map.js";

const map: LessonMap = {
  id: "geometry-review",
  title: "几何综合问题",
  coreKnowledge: ["全等三角形", "辅助线构造"],
  theorems: [
    {
      statement: "两边及其夹角分别相等的两个三角形全等",
      conditions: ["两边对应相等", "夹角对应相等"],
      conclusion: "两个三角形全等",
    },
  ],
  examples: [
    {
      id: "example-1",
      statement: "如图，已知 AB=AC，求证……",
      keyClues: ["AB=AC", "公共边"],
      solutions: [
        {
          name: "全等法",
          trigger: "看到两边及夹角相等",
          idea: "优先寻找全等三角形",
          steps: ["构造辅助线", "证明全等", "得到结论"],
          conclusion: "结论成立",
        },
        {
          name: "等腰三角形法",
          trigger: "看到 AB=AC",
          idea: "利用等腰三角形性质",
          steps: ["识别等腰三角形", "利用底角相等"],
          conclusion: "结论成立",
        },
      ],
    },
  ],
};

describe("LessonMap 与 VideoBrief", () => {
  it("校验知识点、定理和例题的结构", () => {
    expect(lessonMapSchema.parse(map)).toEqual(map);
  });

  it("按核心知识点生成约三分钟的视频任务，并带上证明和例题", () => {
    const briefs = mapLessonMapToVideoBriefs(map);
    expect(briefs).toHaveLength(2);
    expect(briefs[0]).toMatchObject({
      targetDurationSeconds: 135,
      coreKnowledge: ["全等三角形"],
      theorem: map.theorems[0],
      example: map.examples[0],
    });
  });

  it("批量映射多个教案地图且不修改输入", () => {
    const maps = [map, { ...map, id: "another", coreKnowledge: ["相似三角形"] }];
    const briefs = batchVideoBriefs(maps);
    expect(briefs.map((brief) => brief.id)).toEqual([
      "geometry-review-quan-deng-san-jiao-xing",
      "geometry-review-fu-zhu-xian-gou-zao",
      "another-xiang-si-san-jiao-xing",
    ]);
    expect(map.coreKnowledge).toEqual(["全等三角形", "辅助线构造"]);
  });

  it("没有可靠替代解法时标记不可用而不编造", () => {
    const briefs = mapLessonMapToVideoBriefs({
      ...map,
      coreKnowledge: ["全等三角形"],
      examples: [{ ...map.examples[0], solutions: [map.examples[0]!.solutions[0]!] }],
    });
    expect(briefs[0]?.reviewFlags).toContain("ALT_SOLUTION_UNAVAILABLE");
    expect(briefs[0]?.example?.solutions).toHaveLength(1);
  });
});
