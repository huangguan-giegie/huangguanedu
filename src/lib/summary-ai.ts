// 学习总结 AI 建议生成：mock 模式返回固定建议；live 模式调用 Qwen 文本接口并做 Zod 校验。
// 失败时由调用方保留统计结果并标记待重试，不自动发布。
import { z } from "zod";

import { loadConfig } from "./config";

export const SummaryAiSchema = z.object({
  summary: z.string().min(1),
  suggestions: z.array(z.string().min(1)).min(1).max(10),
});

export type SummaryAiOutput = z.infer<typeof SummaryAiSchema>;

export class SummaryAiError extends Error {
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export interface SummaryAiInput {
  studentName: string;
  periodLabel: string;
  dominantSubject: "MATH" | "ENGLISH";
  stats: {
    totalWrongQuestions: number;
    mastered: number;
    weakKnowledgePoints: string[];
  };
}

function mockOutput(input: SummaryAiInput): SummaryAiOutput {
  const points = input.stats.weakKnowledgePoints.slice(0, 2);
  return {
    summary:
      `本期（${input.periodLabel}）共记录错题 ${input.stats.totalWrongQuestions} 道，` +
      `已掌握 ${input.stats.mastered} 道。` +
      (points.length > 0
        ? `薄弱知识点集中在：${points.join("、")}。`
        : "整体掌握情况良好。"),
    suggestions: [
      `建议 ${input.studentName} 优先巩固「${points.join("、") || "核心概念"}」相关知识点。`,
      "每周完成 2-3 道同类错题变式练习，并在完成后对照步骤自查。",
    ],
  };
}

/** 生成学习总结 AI 建议；live 模式缺配置时由 loadConfig 抛出 ConfigError。 */
export async function generateSummaryAi(
  input: SummaryAiInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SummaryAiOutput> {
  const config = loadConfig();
  if (config.qwen.mode !== "live") {
    return mockOutput(input);
  }

  const systemPrompt =
    "你是学习总结助手，只返回合法 JSON，不要返回 Markdown。" +
    "不要输出学生姓名、手机号等身份信息。";
  const userPrompt =
    `请为学生生成一份学习总结建议。统计信息：${JSON.stringify(input.stats)}。` +
    `请严格按指定 JSON 结构返回：{"summary":"整体总结","suggestions":["建议1","建议2"]}。`;

  const body = {
    model: config.qwen.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    enable_thinking: config.qwen.enableThinking,
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.qwen.requestTimeoutMs),
    });
  } catch (error) {
    throw new SummaryAiError(
      true,
      `总结 AI 请求失败：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new SummaryAiError(retryable, `总结 AI HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new SummaryAiError(false, "总结 AI 响应不是合法 JSON");
  }

  const content = (data as { choices?: { message?: { content?: unknown } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new SummaryAiError(false, "总结 AI 响应缺少 choices[0].message.content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new SummaryAiError(true, "总结 AI 返回内容不是合法 JSON");
  }

  const result = SummaryAiSchema.safeParse(parsed);
  if (!result.success) {
    throw new SummaryAiError(true, "总结 AI 返回 JSON 不符合结构");
  }

  console.log(
    `[summary-ai] model=${config.qwen.model} status=${response.status} ` +
      `durationMs=${Date.now() - startedAt} requestId=${response.headers.get("x-request-id") ?? "-"}`,
  );

  return result.data;
}
