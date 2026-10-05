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
});
