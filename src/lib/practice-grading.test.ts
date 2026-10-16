import { afterEach, describe, expect, it, vi } from "vitest";

import { gradePracticeAnswer } from "./practice-grading";

describe("practice grading", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grades normalized exact answers without AI", async () => {
    const result = await gradePracticeAnswer({
      question: "求 x",
      expectedAnswer: "x = 4",
      submittedAnswer: "x=4",
    });
    expect(result).toMatchObject({ result: "CORRECT", score: 100, method: "DETERMINISTIC" });
  });

  it("grades equal scalar values without AI", async () => {
    const result = await gradePracticeAnswer({
      question: "计算",
      expectedAnswer: "4.0",
      submittedAnswer: "4",
    });
    expect(result.result).toBe("CORRECT");
  });

  it("图形数值答案允许省略单位，直线方程允许省略 y=", async () => {
    for (const [expectedAnswer, submittedAnswer] of [["24 cm²", "24"], ["5 cm", "5"], ["20 cm", "20厘米"], ["y = -2x + 3", "-2x + 3"]]) {
      expect(await gradePracticeAnswer({ question: "计算", expectedAnswer, submittedAnswer })).toMatchObject({ result: "CORRECT", score: 100, method: "DETERMINISTIC" });
    }
  });

  it("falls back to AI for non-trivial symbolic answers", async () => {
    vi.stubEnv("QWEN_MODE", "live");
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubEnv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          result: "CORRECT",
          score: 100,
          feedback: "与标准答案等价。",
        }) } }],
      }), { status: 200 }),
    );

    const result = await gradePracticeAnswer({
      question: "化简",
      expectedAnswer: "(x+1)^2",
      submittedAnswer: "x^2+2x+1",
    }, fetchMock as unknown as typeof fetch);
    expect(result.method).toBe("AI");
    expect(result.result).toBe("CORRECT");
  });

  // 以下用例来自「学生答题」功能开发：MathLive 与 LaTeX 输入产出的是
  // \frac{a}{b} 与 x^2 这类写法，而标准答案常写成 1/2 与 x²，
  // 两者不等会导致正确作答被判错。
  describe("LaTeX 输入与标准答案的等价性", () => {
    const grade = (expectedAnswer: string, submittedAnswer: string) =>
      gradePracticeAnswer({ question: "q", expectedAnswer, submittedAnswer });

    it("认可 LaTeX 分数与普通分数等价", async () => {
      expect((await grade("1/2", "\\frac{1}{2}")).result).toBe("CORRECT");
    });

    it("认可渲染后带括号的分数", async () => {
      // latexToUnicode 把 \frac{1}{2} 转成 (1)/(2)，括号需被折叠
      expect((await grade("1/2", "(1)/(2)")).result).toBe("CORRECT");
    });

    it("认可负分数", async () => {
      expect((await grade("-3/4", "-\\frac{3}{4}")).result).toBe("CORRECT");
    });

    it("认可 x^2 与 x² 等价", async () => {
      expect((await grade("x²+2x-8", "x^2+2x-8")).result).toBe("CORRECT");
    });

    it("不破坏坐标对的括号", async () => {
      // (2,0) 的括号是数学语义，剥掉会变成 2,0
      expect((await grade("(2, 0), (-4, 0)", "(2, 0), (-4, 0)")).result).toBe("CORRECT");
    });

    it("答案不同时仍然判错", async () => {
      expect((await grade("(2, 0), (-4, 0)", "(1, 0), (-3, 0)")).result).toBe("INCORRECT");
    });

    it("空答案判错并给出提示", async () => {
      const result = await grade("1/2", "");
      expect(result.result).toBe("INCORRECT");
      expect(result.feedback).toContain("还没有填写");
    });
  });
});
