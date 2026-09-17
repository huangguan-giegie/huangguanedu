import { describe, expect, it } from "vitest";
import { parseLessonText, lessonSchema, normalizeLesson } from "../../src/core/lesson";

describe("lesson 输入", () => {
  it("解析 JSON 并允许缺省 answer", () => {
    const lesson = parseLessonText('{"topic":"分数","question":"1/2 + 1/2 = ?"}', "lesson.json");

    expect(lessonSchema.parse(lesson)).toMatchObject({
      topic: "分数",
      question: "1/2 + 1/2 = ?",
    });
    expect(lesson.answer).toBeUndefined();
  });

  it("只提供知识点时也允许交给 MiMo 自动设计例题", () => {
    expect(normalizeLesson({ topic: "二次函数" })).toMatchObject({ topic: "二次函数" });
  });

  it("为视频内容契约提供 180 秒默认时长和可选开场文案", () => {
    expect(normalizeLesson({ topic: "二次函数" })).toMatchObject({
      targetDurationSeconds: 180,
    });

    expect(normalizeLesson({
      topic: "二次函数",
      targetDurationSeconds: 165,
      hook: "先猜一猜，抛物线最低点在哪里？",
      cta: "想系统掌握中考函数，欢迎加入课程。",
    })).toMatchObject({
      targetDurationSeconds: 165,
      hook: "先猜一猜，抛物线最低点在哪里？",
      cta: "想系统掌握中考函数，欢迎加入课程。",
    });
  });

  it("拒绝 150 到 210 秒之外的目标时长", () => {
    expect(() => normalizeLesson({ topic: "二次函数", targetDurationSeconds: 149 })).toThrow();
    expect(() => normalizeLesson({ topic: "二次函数", targetDurationSeconds: 211 })).toThrow();
  });

  it("解析最小 YAML 并保留可选字段", () => {
    const lesson = parseLessonText(
      [
        "title: 一元一次方程",
        "grade: 七年级",
        "question: x + 2 = 5",
        "answer: 3",
        "solution: 两边同时减 2",
        "imagePath: assets/equation.png",
      ].join("\n"),
      "lesson.yaml",
    );

    expect(normalizeLesson(lesson)).toEqual({
      title: "一元一次方程",
      grade: "七年级",
      question: "x + 2 = 5",
      answer: "3",
      solution: "两边同时减 2",
      imagePath: "assets/equation.png",
      targetDurationSeconds: 180,
    });
  });

  it("保留公式化简步骤供分镜生成使用", () => {
    expect(normalizeLesson({
      topic: "二次函数",
      equationSteps: ["y = x² - 4x + 3", "= (x - 2)² - 1"],
    })).toMatchObject({
      equationSteps: ["y = x² - 4x + 3", "= (x - 2)² - 1"],
    });
  });
});
