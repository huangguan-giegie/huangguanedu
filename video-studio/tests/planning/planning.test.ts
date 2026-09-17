import { describe, expect, it } from "vitest";
import {
  lessonMapSchema,
  teachingPlanSchema,
  videoBriefSchema,
  validateTeachingPlan,
  buildTeachingPrompt,
  formatMathReviewHtml,
  formatMathReviewJson,
  type TeachingPlan,
} from "../../src/planning/index.js";

const validPlan: TeachingPlan = {
  hook: "如果只看一个点，能不能判断整条曲线的最高点？",
  intuition: ["先观察图像的变化", "再把变化翻译成代数关系"],
  proof: {
    statement: "等底等高的三角形面积相等",
    conditions: ["底边相等", "高相等"],
    construction: ["作出公共高"],
    reasoningSteps: ["面积公式相同", "底和高分别相等，所以面积相等"],
    conclusion: "两个三角形面积相等",
  },
  solutions: [
    {
      name: "主解法：面积公式",
      trigger: "题干给出相同的底和高",
      idea: "直接比较面积公式中的两个量",
      steps: ["找出底", "找出高", "代入面积公式"],
      conclusion: "两面积相等",
    },
    {
      name: "替代解法：等积变形",
      trigger: "题图中出现公共底边",
      idea: "把图形沿公共底边重组后比较",
      steps: ["标出公共底边", "补成同一个大图形", "扣除相同部分"],
      conclusion: "剩余面积相等",
    },
  ],
  mistakes: ["把斜边误当成高"],
  summary: "看到公共底和相等的高，就优先想到面积公式。",
  cta: "想把这类题讲透，欢迎加入课程。",
};

describe("planning schema", () => {
  it("接受完整的教学计划、教案地图和视频任务", () => {
    expect(teachingPlanSchema.parse(validPlan)).toEqual(validPlan);
    expect(lessonMapSchema.parse({
      title: "三角形面积",
      coreKnowledge: ["面积公式"],
      theorems: [validPlan.proof],
      examples: [{ statement: "求三角形面积", keyInformation: ["底边", "高"], candidateSolutions: validPlan.solutions }],
    }).title).toBe("三角形面积");
    expect(videoBriefSchema.parse({
      id: "triangle-area",
      title: "三角形面积",
      coreKnowledge: ["面积公式"],
      targetDurationSeconds: 180,
    }).targetDurationSeconds).toBe(180);
    expect(teachingPlanSchema.parse({
      ...validPlan,
      proof: { ...validPlan.proof!, statement: undefined, premise: "底边相等且高相等" },
    }).proof?.premise).toBe("底边相等且高相等");
  });

  it("拒绝不在三分钟范围内的视频任务", () => {
    expect(videoBriefSchema.parse({ id: "x", title: "x", coreKnowledge: ["x"], targetDurationSeconds: 120 }).targetDurationSeconds).toBe(120);
    expect(() => videoBriefSchema.parse({ id: "x", title: "x", coreKnowledge: ["x"], targetDurationSeconds: 80 })).toThrow();
  });
});

describe("validateTeachingPlan", () => {
  it("对完整计划返回无阻断 findings", () => {
    const result = validateTeachingPlan(validPlan);
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("把证明条件、证明步骤和解法缺陷作为非阻断数学发现返回", () => {
    const result = validateTeachingPlan({
      ...validPlan,
      proof: { ...validPlan.proof!, conditions: [], reasoningSteps: [] },
      solutions: [validPlan.solutions[0]],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "PROOF_CONDITIONS_MISSING",
      "PROOF_REASONING_MISSING",
      "ALT_SOLUTION_UNAVAILABLE",
    ]));
    expect(result.findings.every((finding) => finding.blocking === false)).toBe(true);
  });

  it("检测中文缺失、空步骤和重复解法", () => {
    const result = validateTeachingPlan({
      ...validPlan,
      hook: "Find the maximum",
      solutions: [
        validPlan.solutions[0],
        { ...validPlan.solutions[0], name: "另一个名字" },
        { ...validPlan.solutions[0], name: "空步骤解法", steps: [] },
      ],
      mistakes: ["把斜边误当成高"],
    });
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "CHINESE_TEXT_MISSING",
      "SOLUTION_STEPS_MISSING",
      "DUPLICATE_SOLUTION",
    ]));
  });
});

describe("prompt and review formatters", () => {
  it("生成中文教学提示词并明确教学硬要求", () => {
    const prompt = buildTeachingPrompt({
      title: "三角形面积",
      text: "已知底和高，求面积。",
      targetDurationSeconds: 180,
    });
    expect(prompt).toContain("完整证明");
    expect(prompt).toContain("主解法");
    expect(prompt).toContain("替代解法");
    expect(prompt).toContain("题干触发信息");
    expect(prompt).toContain("90-195");
    expect(prompt).not.toContain("English");
  });

  it("以纯函数输出稳定的 JSON 和 HTML 审查结果", () => {
    const findings = [{ code: "ALT_SOLUTION_UNAVAILABLE", message: "缺少可靠的替代解法", blocking: false as const, severity: "warning" as const }];
    const json = formatMathReviewJson(findings);
    expect(JSON.parse(json)).toEqual({ findings });
    const html = formatMathReviewHtml(findings);
    expect(html).toContain("数学审查");
    expect(html).toContain("ALT_SOLUTION_UNAVAILABLE");
    expect(html).toContain("缺少可靠的替代解法");
    expect(html).not.toContain("<script");
  });
});
