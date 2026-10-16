import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePracticeAi } from "./practice-ai";

describe("数学模拟题 AI", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubLiveEnv() {
    vi.stubEnv("QWEN_MODE", "live");
    vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
    vi.stubEnv(
      "DASHSCOPE_BASE_URL",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    );
    vi.stubEnv("QWEN_MAX_RETRIES", "2");
  }

  const input = {
    grade: "初二",
    weakKnowledgePoints: ["一元一次方程"],
    wrongQuestionSamples: ["2x+3=11"],
    count: 4,
  };

  it("按要求解析恰好指定数量的模拟题", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "一元一次方程专项",
                  questions: Array.from({ length: 4 }, (_, index) => ({
                    question: `题目 ${index + 1}`,
                    answer: "答案",
                    explanation: "解析",
                  })),
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await generatePracticeAi(
      input,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.questions).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("400 属于永久错误，不重复请求", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () =>
      new Response("bad request", { status: 400 }),
    );

    await expect(
      generatePracticeAi(input, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("429 会按配置重试，最多总共请求 3 次", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    );

    await expect(
      generatePracticeAi(input, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("返回题数不符时重试并最终失败", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "题数错误",
                  questions: Array.from({ length: 3 }, (_, index) => ({
                    question: `题目 ${index + 1}`,
                    answer: "答案",
                    explanation: "解析",
                  })),
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      generatePracticeAi(input, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("图形题的题干、答案和解析一律由图形参数重算", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: "几何专项",
        questions: Array.from({ length: 4 }, () => ({
          question: "如图，边长为99，求面积",
          answer: "999",
          explanation: "错误的 AI 解释",
          diagram: { type: "rectangle", width: 6, height: 4, task: "AREA" },
        })),
      }) } }],
    }), { status: 200 }));
    const result = await generatePracticeAi(input, fetchMock as unknown as typeof fetch);
    expect(result.questions[0].question).toContain("6 cm");
    expect(result.questions[0].answer).toBe("24 cm²");
    expect(result.questions[0].explanation).not.toContain("错误");
    expect(result.questions[0].diagram).toEqual({ type: "rectangle", width: 6, height: 4, task: "AREA" });
  });

  it("没有可验证图形的如图题拒绝存储并重新生成", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: "不完整几何题",
        questions: Array.from({ length: 4 }, () => ({
          question: "如图，求阴影部分面积",
          answer: "9",
          explanation: "计算可得",
        })),
      }) } }],
    }), { status: 200 }));
    await expect(generatePracticeAi(input, fetchMock as unknown as typeof fetch))
      .rejects.toMatchObject({ retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("高级圆题的错误 AI 答案被确定性公式替换", async () => {
    stubLiveEnv();
    const response = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: "圆的专项训练",
        questions: Array.from({ length: 4 }, () => ({
          question: "AI 写的错误条件",
          answer: "9999 cm",
          explanation: "AI 写的错误公式",
          diagram: { type: "circle_sector", radius: 6, centralAngle: 60, task: "ARC_LENGTH" },
        })),
      }) } }],
    });
    const fetchMock = vi.fn(async () => new Response(response,{status:200}));
    const result = await generatePracticeAi(input,fetchMock as unknown as typeof fetch);
    expect(result.questions[0].answer).toBe("2π cm");
    expect(result.questions[0].question).toContain("∠AOB＝60°");
    expect(result.questions[0].explanation).not.toContain("错误");
  });

  it("高级函数交点由服务器重新解题，而不是相信模型输出", async () => {
    stubLiveEnv();
    const response = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: "函数交点训练",
        questions: Array.from({ length: 4 }, () => ({
          question: "直线没有交点",
          answer: "无解",
          explanation: "AI 错误解析",
          diagram: { type: "linear_intersection", slopes: "1,-2", x: 1, y: 2 },
        })),
      }) } }],
    });
    const fetchMock = vi.fn(async () => new Response(response,{status:200}));
    const result = await generatePracticeAi(input,fetchMock as unknown as typeof fetch);
    expect(result.questions[0].question).toContain("y = x + 1");
    expect(result.questions[0].question).toContain("y = -2x + 4");
    expect(result.questions[0].answer).toBe("P(1, 2)");
  });

});
