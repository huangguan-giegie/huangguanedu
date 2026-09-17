// Qwen（百炼）分析器：OpenAI 兼容 chat/completions，图片 URL 传输，JSON 结构化输出
// 只在服务端调用；API Key 只从环境变量读取；日志不记录图片/Prompt 原文/AI 原始响应
import { loadConfig } from "../config";
import { QuestionAnalysisSchema, type QuestionAnalysis } from "./schema";
import type { AnalyzeInput, QuestionAnalyzer } from "./types";

export class QwenAnalyzerError extends Error {
  constructor(
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export class QwenQuestionAnalyzer implements QuestionAnalyzer {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async analyze(input: AnalyzeInput): Promise<QuestionAnalysis> {
    const config = loadConfig();
    if (!input.imageUrl) {
      throw new QwenAnalyzerError(
        false,
        "live 模式需要可访问的图片 URL",
      );
    }

    const subject = input.subject ?? "MATH";
    const systemPrompt =
      "你是高中数学和英语错题分析助手。只返回合法 JSON，不要返回 Markdown，" +
      "不要输出学生姓名、手机号等身份信息。";
    const userPrompt =
      `请识别图片中的一道题，并分析学生是否写出了自己的解题过程。` +
      `请严格按指定 JSON 结构返回。当前学科：${subject}。`;

    const body = {
      model: config.qwen.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: input.imageUrl,
                max_pixels: config.qwen.maxPixels,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
      response_format: { type: "json_object" },
      enable_thinking: config.qwen.enableThinking,
    };

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${config.qwen.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            // live 模式下 loadConfig 已强制要求 API Key
            Authorization: `Bearer ${config.qwen.apiKey!}`,
            "Content-Type": "application/json",
            ...(input.imageUrl.startsWith("oss://")
              ? { "X-DashScope-OssResourceResolve": "enable" }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.qwen.requestTimeoutMs),
        },
      );
    } catch (error) {
      // 超时/网络错误可重试
      throw new QwenAnalyzerError(
        true,
        `Qwen 请求失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }

    // 4xx 配置错误不重试；429/5xx 可重试
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new QwenAnalyzerError(
        retryable,
        `Qwen HTTP ${response.status}`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new QwenAnalyzerError(false, "Qwen 响应不是合法 JSON");
    }

    const content = (data as { choices?: { message?: { content?: unknown } }[] })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new QwenAnalyzerError(false, "Qwen 响应缺少 choices[0].message.content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new QwenAnalyzerError(true, "Qwen 返回内容不是合法 JSON");
    }

    const result = QuestionAnalysisSchema.safeParse(parsed);
    if (!result.success) {
      // schema 不匹配可重试（换一次输出）
      throw new QwenAnalyzerError(true, "Qwen 返回 JSON 不符合结构");
    }

    // 日志只记录模型、耗时、HTTP 状态（不含图片/Prompt/AI 原始响应）
    console.log(
      `[qwen] model=${config.qwen.model} status=${response.status} ` +
        `durationMs=${Date.now() - startedAt} requestId=${response.headers.get("x-request-id") ?? "-"}`,
    );

    return result.data;
  }
}
