import { loadConfig } from "./config";

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askTutor(input: {
  question: string;
  expectedAnswer: string;
  explanation?: string | null;
  message: string;
  history?: TutorMessage[];
}, fetchImpl: typeof fetch = fetch): Promise<string> {
  const config = loadConfig();
  if (config.qwen.mode !== "live") {
    return "先说说你目前做到哪一步、卡在哪里？我会从你卡住的那一步给提示。";
  }

  const history = (input.history ?? []).slice(-6).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 1000),
  }));

  const response = await fetchImpl(`${config.qwen.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.qwen.apiKey!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.qwen.model,
      messages: [
        {
          role: "system",
          content:
            "你是一名耐心的中学数学老师。采用苏格拉底式引导：优先提问、给下一步提示、指出概念，不要一上来直接抄完整标准答案。学生明确要求答案时可以给，但仍要解释关键步骤。回复简洁，通常不超过180字。不要索取或输出任何个人身份信息。",
        },
        {
          role: "system",
          content: `当前练习题：${input.question}\n标准答案：${input.expectedAnswer}\n参考解析：${input.explanation ?? "无"}`,
        },
        ...history,
        { role: "user", content: input.message.slice(0, 1500) },
      ],
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(Math.min(config.qwen.requestTimeoutMs, 20000)),
  });

  if (!response.ok) {
    throw new Error(`AI Tutor HTTP ${response.status}`);
  }
  const data = await response.json().catch(() => null) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI Tutor 响应为空");
  }
  return content.trim();
}
