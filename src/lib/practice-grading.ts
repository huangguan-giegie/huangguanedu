import { z } from "zod";

import { loadConfig } from "./config";

export type GradingResult = "CORRECT" | "PARTIAL" | "INCORRECT";

export interface GradeOutput {
  result: GradingResult;
  score: number;
  feedback: string;
  method: "DETERMINISTIC" | "AI";
}

const AiGradeSchema = z.object({
  result: z.enum(["CORRECT", "PARTIAL", "INCORRECT"]),
  score: z.number().min(0).max(100),
  feedback: z.string().min(1).max(300),
});

export class PracticeGradingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeGradingError";
  }
}

function normalized(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\left|\\right/g, "")
    .replace(/[＄$]/g, "")
    .replace(/[，,；;。]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
}

function scalar(value: string): number | null {
  const cleaned = normalized(value).replace(/^(?:x|y|答案|answer)=?/i, "");
  if (!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function deterministicGrade(expected: string, submitted: string): GradeOutput | null {
  const a = normalized(expected);
  const b = normalized(submitted);
  if (!b) {
    return { result: "INCORRECT", score: 0, feedback: "还没有填写答案。", method: "DETERMINISTIC" };
  }
  if (a === b) {
    return { result: "CORRECT", score: 100, feedback: "答案正确。", method: "DETERMINISTIC" };
  }

  const expectedNumber = scalar(expected);
  const submittedNumber = scalar(submitted);
  if (expectedNumber !== null && submittedNumber !== null) {
    const tolerance = Math.max(1e-9, Math.abs(expectedNumber) * 1e-8);
    if (Math.abs(expectedNumber - submittedNumber) <= tolerance) {
      return { result: "CORRECT", score: 100, feedback: "答案正确。", method: "DETERMINISTIC" };
    }
    return { result: "INCORRECT", score: 0, feedback: "数值与标准答案不一致，请检查计算过程。", method: "DETERMINISTIC" };
  }

  return null;
}

export async function gradePracticeAnswer(
  input: {
    question: string;
    expectedAnswer: string;
    explanation?: string | null;
    submittedAnswer: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<GradeOutput> {
  const deterministic = deterministicGrade(input.expectedAnswer, input.submittedAnswer);
  if (deterministic) return deterministic;

  const config = loadConfig();
  if (config.qwen.mode !== "live") {
    return {
      result: "INCORRECT",
      score: 0,
      feedback: "当前为离线判题模式，复杂表达式需要老师或在线 AI 复核。",
      method: "DETERMINISTIC",
    };
  }

  const body = {
    model: config.qwen.model,
    messages: [
      {
        role: "system",
        content:
          "你是数学判题器。判断学生答案与标准答案在数学意义上是否等价，允许等价分数、化简形式和合理近似。只返回 JSON；不要根据学生身份做判断。",
      },
      {
        role: "user",
        content:
          `题目：${input.question}\n标准答案：${input.expectedAnswer}\n参考解析：${input.explanation ?? "无"}\n学生答案：${input.submittedAnswer}\n` +
          '返回 {"result":"CORRECT|PARTIAL|INCORRECT","score":0-100,"feedback":"不超过120字的中文反馈"}。',
      },
    ],
    response_format: { type: "json_object" },
    enable_thinking: false,
  };

  let response: Response;
  try {
    response = await fetchImpl(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(config.qwen.requestTimeoutMs, 20000)),
    });
  } catch (error) {
    throw new PracticeGradingError(
      `AI 判题请求失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }

  if (!response.ok) {
    throw new PracticeGradingError(`AI 判题 HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => null) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new PracticeGradingError("AI 判题响应格式错误");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PracticeGradingError("AI 判题返回的 JSON 无效");
  }
  const result = AiGradeSchema.safeParse(parsed);
  if (!result.success) {
    throw new PracticeGradingError("AI 判题结果字段无效");
  }

  return {
    ...result.data,
    score: Math.round(result.data.score),
    method: "AI",
  };
}
