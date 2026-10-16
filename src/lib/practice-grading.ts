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
  return collapseRedundantBrackets(
    value
      .trim()
      .toLowerCase()
      .replace(/\\left|\\right/g, "")
      // 残留的 LaTeX 分数命令：判分前 latexToUnicode 会把 \frac{a}{b} 转成 (a)/(b)，
      // 但如果输入直接来自 API（跳过渲染链），这里兜底再转一次。
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/[＄$]/g, "")
      .replace(/[，,；;。]/g, "")
      .replace(/[−–—]/g, "-")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\s+/g, ""),
  );
}

/**
 * 去掉分数中多余的括号，使 (1)/(2) 与 1/2 判为等价。
 *
 * 只处理「被除号两侧各裹一层、且括号内不含运算符」的情况——
 * (√5+1)/2 里的括号是数学语义的一部分，不能去掉。
 * 因此要求括号内容不含 + - * / ^ < > =这些运算符。
 */
function collapseRedundantBrackets(value: string): string {
  return value.replace(/\(([^()]*)\)/g, (whole, inner: string) => {
    // 内容含运算符或分隔符说明括号有数学意义（(2,0) 是坐标对、(a+b) 是和），
    // 只有「单个数字/字母」这种最简内容才允许剥掉。
    if (/[+\-*/^<>=,.]/.test(inner)) return whole;
    return inner;
  });
}

/**
 * 还原上下标为可比较形式：x^2 → x2，x² → x2。
 *
 * MathLive 与 LaTeX 输入都会产出这两种写法，而标准答案可能是 x^2 也可能是 x²。
 * 统一成"字母+数字"后两侧才能相等。
 */
function foldSuperscripts(value: string): string {
  const superscripts: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁻": "-", "⁺": "+",
  };
  let out = value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (ch) => superscripts[ch] ?? ch);
  // x^23 / x^{23} → x23（保留多位数，不逐字符替换）
  out = out.replace(/\^([0-9]+)/g, "$1");
  out = out.replace(/\^\{([^{}]*)\}/g, "$1");
  // x² → x2：上标字符紧跟在标识符后
  out = out.replace(
    /([a-z])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g,
    (_all, base: string, marks: string) =>
      base + [...marks].map((ch) => superscripts[ch] ?? ch).join(""),
  );
  return out;
}

function scalar(value: string): number | null {
  const cleaned = canonical(value)
    .replace(/^(?:x|y|答案|answer)=?/i, "")
    .replace(/(?:cm²|cm2|平方厘米|cm|厘米)$/i, "");
  if (!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 最终用于逐字比较的形式：在 normalized 之上再折叠上下标。 */
function canonical(value: string): string {
  return foldSuperscripts(normalized(value));
}

function deterministicGrade(expected: string, submitted: string): GradeOutput | null {
  const a = canonical(expected);
  const b = canonical(submitted);
  if (!b) {
    return { result: "INCORRECT", score: 0, feedback: "还没有填写答案。", method: "DETERMINISTIC" };
  }
  if (a === b || (a.startsWith("y=") && a.slice(2) === b)) {
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
