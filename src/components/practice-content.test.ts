import { describe, expect, it } from "vitest";

import { isPracticeGenerating, practiceText, togglePracticeSource, type PracticeSetItem } from "./practice-content";

describe("模拟题展示", () => {
  it("最多选择 20 道错题，达到上限后仍可取消选择", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `q${index}`);
    expect(togglePracticeSource(ids, "extra")).toEqual(ids);
    expect(togglePracticeSource(ids, "q0")).toHaveLength(19);
    expect(togglePracticeSource([], "q1")).toEqual(["q1"]);
  });

  it("只有未完成任务会继续轮询", () => {
    const task = { jobId: "j", studentId: "s", error: null, practiceSetId: null };
    expect(isPracticeGenerating({ ...task, status: "PENDING" })).toBe(true);
    expect(isPracticeGenerating({ ...task, status: "PROCESSING" })).toBe(true);
    expect(isPracticeGenerating({ ...task, status: "DONE" })).toBe(false);
    expect(isPracticeGenerating({ ...task, status: "FAILED" })).toBe(false);
    expect(isPracticeGenerating(null)).toBe(false);
  });

  it("空白练习卷不包含答案，完整复制包含解析并转换公式", () => {
    const set: PracticeSetItem = {
      id: "set", studentId: "s", studentName: "测试学生", title: "数学练习", createdAt: "2026-10-05",
      questions: [{ id: "q", question: "求 $\\sqrt{4}$", answer: "2", explanation: "平方根计算", imageUrl: null }],
    };
    expect(practiceText(set, false)).toContain("求 √(4)");
    expect(practiceText(set, false)).not.toContain("答案");
    expect(practiceText(set, true)).toContain("答案：2");
    expect(practiceText(set, true)).toContain("解析：平方根计算");
  });
});
