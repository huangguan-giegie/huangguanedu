import { z } from "zod";

import { loadConfig } from "./config";
import { compileDiagramProblem, PracticeDiagramSchema, refersToMissingFigure } from "./practice-diagram";

const PracticeQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  explanation: z.string().min(1),
  knowledgePoints: z.array(z.string().min(1)).max(5).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  diagram: PracticeDiagramSchema.optional(),
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
  difficulty?: "EASY" | "MEDIUM" | "HARD";
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
        knowledgePoints: [point],
        difficulty: input.difficulty ?? "MEDIUM",
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
    "只返回合法 JSON，不要 Markdown，不要包含学生姓名或其他身份信息。" +
    "几何图、坐标图必须使用给定的 diagram 结构，不允许自己想象画图，也不允许图片URL、SVG、ASCII图、Mermaid。" +
    "图形题的题干、答案、解析会由服务器根据 diagram 的精确数值重算，你写的这三项不作为图形题的权威来源。" +
    "如果题型无法使用支持的图形结构，必须改为完全不依赖图的纯文字题；不得出现如图、见图、下图、图中等指代。";
  const userPrompt =
    `年级：${input.grade}。薄弱知识点：${JSON.stringify(input.weakKnowledgePoints)}。` +
    `参考错题：${JSON.stringify(input.wrongQuestionSamples)}。` +
    `请生成恰好 ${input.count} 道数学模拟题，` +
    (input.difficulty
      ? `整体难度为${input.difficulty === "EASY" ? "基础" : input.difficulty === "MEDIUM" ? "中等" : "较难"}。`
      : "难度从基础到中等递进。") +
    '严格返回：{"title":"题组标题","questions":[{"question":"题目","answer":"答案","explanation":"解析","knowledgePoints":["知识点"],"difficulty":"EASY|MEDIUM|HARD","diagram":可选的图形结构}]}。' +
    '仅支持三种图形：{"type":"rectangle","width":6,"height":4,"task":"AREA"}（task 为 AREA 或 PERIMETER）；' +
    '{"type":"right_triangle","triple":"3-4-5"}（triple 仅可选 3-4-5、5-12-13、8-15-17、7-24-25）；' +
    '{"type":"linear_function","slope":2,"intercept":-1}（斜率非零，绝对值不超过3，截距绝对值不超过4）。' +
    '没有图形的题目省略 diagram 字段。优先给中学生安排包含正确配图的几何或函数题，给小学生安排长方形题。';

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
  // Never persist a hallucinated image description or an unsupported “see figure” question.
  const questions = result.data.questions.map((question) => {
    if (question.diagram) {
      const canonical = compileDiagramProblem(question.diagram);
      return { ...question, ...canonical };
    }
    if (refersToMissingFigure(question.question)) {
      throw new PracticeAiError(true, "模拟题出现无配图的题干，正在重新生成");
    }
    return question;
  });
  return { ...result.data, questions };
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
