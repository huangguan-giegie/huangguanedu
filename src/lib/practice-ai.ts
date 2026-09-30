import { z } from "zod";

import { loadConfig } from "./config";

const PracticeQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  explanation: z.string().min(1),
});

export const PracticeSetAiSchema = z.object({
  title: z.string().min(1),
  questions: z.array(PracticeQuestionSchema).min(3).max(5),
});

export type PracticeSetAiOutput = z.infer<typeof PracticeSetAiSchema>;

export class PracticeAiError extends Error {
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "PracticeAiError";
  }
}

export interface PracticeAiInput {
  grade: string;
  weakKnowledgePoints: string[];
  wrongQuestionSamples: string[];
  count: number;
}

function mockOutput(input: PracticeAiInput): PracticeSetAiOutput {
  const point = input.weakKnowledgePoints[0] ?? "基础综合";
  return {
    title: `${input.grade}数学 · ${point}专项模拟题`,
    questions: Array.from({ length: input.count }, (_, index) => {
      const n = index + 2;
      return {
        question: `解方程：${n}x + ${index + 1} = ${n * 4 + index + 1}，求 x。`,
        answer: "x = 4",
        explanation: `先将常数项移到等号右侧，再同时除以 ${n}。`,
      };
    }),
  };
}

async function generateOnce(
  input: PracticeAiInput,
  fetchImpl: typeof fetch,
): Promise<PracticeSetAiOutput> {
  const config = loadConfig();
  if (config.qwen.mode !== "live") {
    return mockOutput(input);
  }

  const systemPrompt =
    "你是一名初高中数学教师。请根据学生薄弱知识点生成同类但不重复原题的模拟题。" +
    "只返回合法 JSON，不要 Markdown，不要包含学生姓名或其他身份信息。";
  const userPrompt =
    `年级：${input.grade}。薄弱知识点：${JSON.stringify(input.weakKnowledgePoints)}。` +
    `参考错题：${JSON.stringify(input.wrongQuestionSamples)}。` +
    `请生成恰好 ${input.count} 道数学模拟题，难度从基础到中等递进。` +
    '严格返回：{"title":"题组标题","questions":[{"question":"题目","answer":"答案","explanation":"解析"}]}。';

  let response: Response;
  try {
    response = await fetchImpl(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.qwen.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        enable_thinking: config.qwen.enableThinking,
      }),
      signal: AbortSignal.timeout(config.qwen.requestTimeoutMs),
    });
  } catch (error) {
    throw new PracticeAiError(
      true,
      `模拟题 AI 请求失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new PracticeAiError(retryable, `模拟题 AI HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PracticeAiError(true, "模拟题 AI 响应不是合法 JSON");
  }

  const content = (data as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new PracticeAiError(true, "模拟题 AI 响应缺少 choices[0].message.content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new PracticeAiError(true, "模拟题 AI 返回内容不是合法 JSON");
  }

  const result = PracticeSetAiSchema.safeParse(parsed);
  if (!result.success || result.data.questions.length !== input.count) {
    throw new PracticeAiError(true, `模拟题 AI 必须返回恰好 ${input.count} 道题`);
  }
  return result.data;
}

export async function generatePracticeAi(
  input: PracticeAiInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PracticeSetAiOutput> {
  const maxRetries = loadConfig().qwen.maxRetries;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await generateOnce(input, fetchImpl);
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof PracticeAiError) ||
        !error.retryable ||
        attempt === maxRetries
      ) {
        throw error;
      }
    }
  }
  throw lastError;
}
