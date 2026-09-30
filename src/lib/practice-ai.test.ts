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
});
