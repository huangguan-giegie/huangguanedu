import { describe, expect, it } from "vitest";

import {
  buildExportFilename,
  buildWrongQuestionsMarkdown,
  type ExportableWrongQuestion,
} from "./wrong-question-export";

function sampleItem(overrides: Partial<ExportableWrongQuestion> = {}): ExportableWrongQuestion {
  return {
    id: "wq-1",
    subject: "MATH",
    recognizedQuestion: "解方程 2x+3=11",
    questionType: "解方程",
    finalAnswer: "x=4",
    correctSteps: ["2x=8", "x=4"],
    errorCauses: ["移项未变号"],
    thinkingHint: "先移项，再系数化为 1",
    remedialPractice: ["多练移项"],
    mastered: false,
    status: "PUBLISHED",
    isTeacherReviewed: false,
    teacherNote: null,
    firstSeenAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T10:00:00Z"),
    knowledgePoints: ["一元一次方程"],
    ...overrides,
  };
}

describe("wrong-question-export", () => {
  it("生成 Markdown：标题、统计、题目与解析字段", () => {
    const content = buildWrongQuestionsMarkdown({
      subject: "MATH",
      from: "2026-05-01T00:00:00Z",
      items: [sampleItem()],
    });
    expect(content).toContain("# 错题本导出");
    expect(content).toContain("共 1 道错题");
    expect(content).toContain("筛选：数学 · 近三个月");
    expect(content).toContain("## 第 1 题 · 数学");
    expect(content).toContain("**知识点**：一元一次方程");
    expect(content).toContain("解方程 2x+3=11");
    expect(content).toContain("**完整解答**");
    expect(content).toContain("- 1. 2x=8");
    expect(content).toContain("**最终答案**");
    expect(content).toContain("x=4");
    expect(content).toContain("**错误原因**");
    expect(content).toContain("移项未变号");
    expect(content).toContain("**思路讲解**");
    expect(content).toContain("先移项，再系数化为 1");
    expect(content).toContain("> 状态：已发布 · 掌握：待复习");
  });

  it("空数组生成空统计", () => {
    const content = buildWrongQuestionsMarkdown({ items: [] });
    expect(content).toContain("共 0 道错题");
  });

  it("null/空字段省略对应区块", () => {
    const content = buildWrongQuestionsMarkdown({
      items: [sampleItem({ finalAnswer: null, correctSteps: null, thinkingHint: null })],
    });
    expect(content).not.toContain("**最终答案**");
    expect(content).not.toContain("**完整解答**");
    expect(content).not.toContain("**思路讲解**");
  });

  it("英语阅读状态显示老师已审核", () => {
    const content = buildWrongQuestionsMarkdown({
      items: [
        sampleItem({
          subject: "ENGLISH",
          status: "REVIEWED",
          isTeacherReviewed: true,
          mastered: true,
        }),
      ],
    });
    expect(content).toContain("第 1 题 · 英语");
    expect(content).toContain("老师已审核 · 掌握：已理解");
  });

  it("文件名 ASCII 格式", () => {
    const filename = buildExportFilename(new Date("2026-08-11T00:00:00Z"));
    expect(filename).toBe("wrong-questions-2026-08-11.md");
  });
});
