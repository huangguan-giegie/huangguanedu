import { afterEach, describe, expect, it, vi } from "vitest";

import { QwenQuestionAnalyzer, findMissingGeometrySymbols, repairAnalysis, repairGeometrySymbols, repairMissingAngleSymbols, repairLeadingAngleSymbols } from "./qwen";

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
    expect(body.model).toBe("qwen3.8-max");
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

  it("英语分页按顺序发送并使用所选视觉模型，不臆测学生过程", async () => {
    stubLiveEnv();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...validResult, subject: "ENGLISH", studentApproach: "模型猜测" }) } }] }), { status: 200 }));
    const analyzer = new QwenQuestionAnalyzer(fetchMock as unknown as typeof fetch);
    const result = await analyzer.analyze({ imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"], mimeType: "image/jpeg", subject: "ENGLISH", model: "qwen-vl-plus" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe("qwen-vl-plus");
    expect(body.messages[1].content.slice(0, 2).map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual(["https://example.com/1.jpg", "https://example.com/2.jpg"]);
    expect(body.messages[1].content[2].text).toContain("原文依据");
    expect(result.studentApproach).toBeNull();
  });
});

describe("几何关系符号的修复与缺失检测", () => {
  it("把 ASCII 近似符号修成标准符号", () => {
    expect(repairGeometrySymbols("且 DE // BC")).toBe("且 DE∥BC");
    expect(repairGeometrySymbols("AB||CD")).toBe("AB∥CD");
    expect(repairGeometrySymbols("求证：△ADE ~ △ABC")).toBe("求证：△ADE∽△ABC");
  });

  it("不误伤普通文本里的波浪号与斜杠", () => {
    expect(repairGeometrySymbols("取值范围是 1~5")).toBe("取值范围是 1~5");
    expect(repairGeometrySymbols("网址 https://a.cn")).toBe("网址 https://a.cn");
  });

  it("标准符号原样保留，幂等", () => {
    const text = "DE∥BC，CD⊥AB，△ADE∽△ABC";
    expect(repairGeometrySymbols(text)).toBe(text);
    expect(repairGeometrySymbols(repairGeometrySymbols("且 DE // BC"))).toBe("且 DE∥BC");
  });

  it("能检出被整个省略的关系符号（两个点名之间多个空格）", () => {
    expect(findMissingGeometrySymbols("且 DE  BC。")).toEqual(["DE  BC"]);
    expect(findMissingGeometrySymbols("CD  AB 于点 D")).toEqual(["CD  AB"]);
  });

  it("正常书写不报缺失", () => {
    expect(findMissingGeometrySymbols("DE∥BC，CD⊥AB")).toEqual([]);
    expect(findMissingGeometrySymbols("AD = 4，BD = 9，求 CD 的长")).toEqual([]);
  });

  it("等号右侧丢失的 ∠ 被补回（第二轮线上实例）", () => {
    expect(repairMissingAngleSymbols("∠ADE =∠ABC，∠AED = ACB")).toBe("∠ADE =∠ABC，∠AED = ∠ACB");
    // 数字与线段等式不受影响
    expect(repairMissingAngleSymbols("∠A = 90°，AB = CD")).toBe("∠A = 90°，AB = CD");
    expect(repairMissingAngleSymbols("∠B = ∠C")).toBe("∠B = ∠C");
  });

  it("解析里的 ∼（U+223C）与题干 ∽（U+223D）归一为 ∽", () => {
    expect(repairGeometrySymbols("∴△ADE∼△ABC")).toBe("∴△ADE∽△ABC");
    // 约等写法不受影响
    expect(repairGeometrySymbols("答案 ∼50% 正确")).toBe("答案 ∼50% 正确");
  });

  it("可修的不标记复核，修不了的标记复核并给出原因", () => {
    const base = {
      recognizedQuestion: "且 DE // BC",
      subject: "MATH" as const,
      questionType: "证明题",
      studentWorkDetected: false,
      studentWorkTranscription: null,
      studentApproach: null,
      firstErrorStep: null,
      misconception: null,
      whatStudentDidWell: null,
      thinkingHint: "平行线法",
      correctSteps: ["由 DE∥BC"],
      finalAnswer: "BC = 9",
      errorCauses: ["未识别平行"],
      knowledgePoints: ["相似三角形的判定"],
      difficulty: "MEDIUM" as const,
      aiConfidence: 0.9,
      needsTeacherReview: false,
      reviewReasons: [],
      remedialPractice: ["再练一次"],
    };

    const withAngleLoss = repairAnalysis({ ...base, studentWorkTranscription: "因为 DE∥BC，所以∠ADE =∠ABC，∠AED = ACB。" });
    expect(withAngleLoss.studentWorkTranscription).toContain("∠AED = ∠ACB");

    const fixed = repairAnalysis(base);
    expect(fixed.recognizedQuestion).toBe("且 DE∥BC");
    expect(fixed.needsTeacherReview).toBe(false);

    const broken = repairAnalysis({ ...base, recognizedQuestion: "且 DE  BC" });
    expect(broken.needsTeacherReview).toBe(true);
    expect(broken.reviewReasons.join()).toContain("漏掉");
  });

  it("英语题不做几何符号处理", () => {
    const en = {
      recognizedQuestion: "Read the passage: A  B",
      subject: "ENGLISH" as const,
      questionType: "阅读理解",
      studentWorkDetected: false,
      studentWorkTranscription: null,
      studentApproach: null,
      firstErrorStep: null,
      misconception: null,
      whatStudentDidWell: null,
      thinkingHint: "定位关键词",
      correctSteps: ["定位"],
      finalAnswer: "B",
      errorCauses: [],
      knowledgePoints: ["细节理解"],
      difficulty: "EASY" as const,
      aiConfidence: 0.9,
      needsTeacherReview: false,
      reviewReasons: [],
      remedialPractice: [],
    };
    expect(repairAnalysis(en)).toBe(en);
  });
});


describe("左侧丢失 ∠ 的修复（q5 线上实例）", () => {
  it("点名 = 数值° 补 ∠，保留原空格", () => {
    expect(repairLeadingAngleSymbols("AB 是⊙O 的直径，ADC = 110°。求∠BAC")).toBe("AB 是⊙O 的直径，∠ADC = 110°。求∠BAC");
    expect(repairLeadingAngleSymbols("∠C = 90°")).toBe("∠C = 90°");
  });
  it("线段长度与单字母不受影响", () => {
    expect(repairLeadingAngleSymbols("AB = 2.5，BC = 0.7")).toBe("AB = 2.5，BC = 0.7");
    expect(repairLeadingAngleSymbols("AC = 6 米")).toBe("AC = 6 米");
    expect(repairLeadingAngleSymbols("x = 90°")).toBe("x = 90°");
  });
});
