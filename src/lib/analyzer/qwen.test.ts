import { afterEach, describe, expect, it, vi } from "vitest";

import { QwenQuestionAnalyzer } from "./qwen";

describe("Qwen 分析器", () => {
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
  }

  const validResult = {
    recognizedQuestion: "解方程 2x+3=11",
    subject: "MATH",
    questionType: "解方程",
    studentWorkDetected: false,
    studentWorkTranscription: null,
    studentApproach: null,
    firstErrorStep: null,
    misconception: null,
    whatStudentDidWell: null,
    thinkingHint: "移项",
    correctSteps: ["2x=8", "x=4"],
    finalAnswer: "x=4",
    errorCauses: ["移项错误"],
    knowledgePoints: ["一元一次方程"],
    difficulty: "EASY",
    aiConfidence: 0.9,
    needsTeacherReview: false,
    reviewReasons: [],
    remedialPractice: ["练习"],
  };

  it("构造正确的请求体并解析结构化结果", async () => {
    stubLiveEnv();
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init: init! };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validResult) } }],
        }),
        {
          status: 200,
          headers: { "x-request-id": "req-1" },
        },
      );
    });

    const analyzer = new QwenQuestionAnalyzer(fetchMock as unknown as typeof fetch);
    const result = await analyzer.analyze({
      imageUrl: "https://img.example.com/q.jpg",
      mimeType: "image/jpeg",
      subject: "MATH",
    });

    expect(result.finalAnswer).toBe("x=4");
    expect(captured!.url).toContain("/chat/completions");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.model).toBe("qwen3.7-plus");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.enable_thinking).toBe(false);
    expect(body.messages[0].content).toContain("JSON");
    expect(body.messages[1].content[0].image_url.max_pixels).toBe(4194304);
    expect(captured!.init.headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("非法 JSON 抛出可重试错误", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not-json" } }],
        }),
        { status: 200 },
      ),
    );
    const analyzer = new QwenQuestionAnalyzer(fetchMock as unknown as typeof fetch);

    await expect(
      analyzer.analyze({
        imageUrl: "https://img.example.com/q.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("4xx 配置错误不可重试", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    const analyzer = new QwenQuestionAnalyzer(fetchMock as unknown as typeof fetch);

    await expect(
      analyzer.analyze({
        imageUrl: "https://img.example.com/q.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("429/5xx 可重试", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const analyzer = new QwenQuestionAnalyzer(fetchMock as unknown as typeof fetch);

    await expect(
      analyzer.analyze({
        imageUrl: "https://img.example.com/q.jpg",
        mimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("缺少图片 URL 时抛不可重试错误", async () => {
    stubLiveEnv();
    const analyzer = new QwenQuestionAnalyzer();
    await expect(
      analyzer.analyze({ mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({
      retryable: false,
    });
  });
});
