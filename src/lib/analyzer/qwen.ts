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

/** 模型未检测到学生过程时，禁止把猜测内容写入学生错题记录。 */
export function normalizeQuestionAnalysis(
  result: QuestionAnalysis,
): QuestionAnalysis {
  if (result.studentWorkDetected) {
    return result;
  }
  return {
    ...result,
    studentWorkTranscription: null,
    studentApproach: null,
    firstErrorStep: null,
    misconception: null,
    whatStudentDidWell: null,
  };
}

/** 低置信度默认进入老师复核，但仍可由学生确认识别准确后按业务规则发布。 */
export function needsTeacherReviewForAnalysis(
  result: QuestionAnalysis,
  minConfidence: number,
): boolean {
  return result.needsTeacherReview || result.aiConfidence < minConfidence;
}

export class QwenQuestionAnalyzer implements QuestionAnalyzer {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async analyze(input: AnalyzeInput): Promise<QuestionAnalysis> {
    const config = loadConfig();
    // 多图优先；单图兼容 imageUrl，合并为统一数组
    const imageUrls: string[] = [];
    if (input.imageUrl && !input.imageUrls?.includes(input.imageUrl)) {
      imageUrls.push(input.imageUrl);
    }
    for (const url of input.imageUrls ?? []) {
      if (url && !imageUrls.includes(url)) imageUrls.push(url);
    }
    const primaryUrl = imageUrls[0];
    if (imageUrls.length === 0) {
      throw new QwenAnalyzerError(
        false,
        "live 模式需要可访问的图片 URL",
      );
    }

    const subject = input.subject ?? "MATH";
    const systemPrompt =
      "你是高中数学和英语错题分析助手。只返回合法 JSON，不要返回 Markdown，" +
      "不要输出学生姓名、手机号等身份信息。";
    // 按学科分支定义「思路讲解 / 解题步骤 / 最终答案」的输出要求
    const subjectInstructions =
      subject === "MATH"
        ? `  "thinkingHint": "解题思路完整讲解：先用文字完整讲一遍解题思路，再说明为什么是这个思路（明确指出从题干哪些已知条件/特征/设问推导而来）；先讲思路再列式子，不要一上来就写式子。数学符号使用标准 LaTeX：根号用 \\sqrt{x}，分数用 \\frac{a}{b}，不要写成 \\rac{x} 或类似拼写",\n` +
          `  "correctSteps": ["标准解题步骤：从第一步开始写出完整式子与关键计算，每步一个字符串；符号使用标准 LaTeX（根号 \\sqrt、分数 \\frac，不要写成 \\rac）"],\n` +
          `  "finalAnswer": "最终答案（简洁给出；根号用 \\sqrt，分数用 \\frac）",\n`
        : `  "thinkingHint": "解题思路完整讲解：先讲如何从题干关键词定位原文、理解文章结构，再说明答案依据在哪里",\n` +
          `  "correctSteps": ["标准解题步骤：按题目顺序逐题给出解题过程，每步一个字符串"],\n` +
          `  "finalAnswer": "最终答案。阅读理解题必须逐小题作答，每一小题的答案后附原文中对应的句子作为证据（引用原句），格式：第X题：〈答案〉原文依据：'……'，各小题用换行分隔",\n`;
    const userPrompt =
      `请识别图片中的一道题，并分析学生是否写出了自己的解题过程。` +
      `当前学科：${subject}。\n\n` +
      `必须返回一个 JSON 对象，字段名使用 camelCase，包含且仅包含以下字段：\n` +
      `{\n` +
      `  "recognizedQuestion": "识别出的完整题目文本",\n` +
      `  "subject": "${subject}",\n` +
      `  "questionType": "题型（如 解方程、证明题、阅读理解）",\n` +
      `  "studentWorkDetected": true或false（图片中是否有学生手写解题过程）,\n` +
      `  "studentWorkTranscription": "学生演算过程逐字转录，未检测到则为 null",\n` +
      `  "studentApproach": "学生解题思路概述，未检测到则为 null",\n` +
      `  "firstErrorStep": "学生第一个出错步骤的描述，未检测到则为 null",\n` +
      `  "misconception": "学生暴露的错误概念或误解，未检测到则为 null",\n` +
      `  "whatStudentDidWell": "学生做得好的地方，未检测到则为 null",\n` +
      subjectInstructions +
      `  "errorCauses": ["错误原因"],\n` +
      `  "knowledgePoints": ["涉及的知识点"],\n` +
      `  "difficulty": "EASY 或 MEDIUM 或 HARD 或 UNKNOWN",\n` +
      `  "aiConfidence": 0到1之间的数字（置信度）,\n` +
      `  "needsTeacherReview": true或false（是否建议老师复核）,\n` +
      `  "reviewReasons": ["建议复核的原因，无则空数组"],\n` +
      `  "remedialPractice": ["针对性练习建议"]\n` +
      `}\n` +
      `不要返回任何字段之外的键，不要使用 Markdown 代码块包裹 JSON。` +
      (imageUrls.length > 1
        ? `\n注意：本次上传的 ${imageUrls.length} 张图片属于同一篇英语阅读理解材料（按阅读顺序分页拍摄）。` +
          `请综合全部图片识别这一篇阅读的完整内容及其题目。` +
          `如果图片中混有多篇独立阅读或多道独立题目，只识别第一篇阅读（第一个题目），忽略其余内容，` +
          `不要把多篇阅读合并成一道题，也不要逐篇分析。`
        : "");

    const body = {
      model: input.model ?? config.qwen.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            ...imageUrls.map((url) => ({
              type: "image_url",
              image_url: {
                url,
                max_pixels: config.qwen.maxPixels,
              },
            })),
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
            ...(primaryUrl?.startsWith("oss://")
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
      `[qwen] model=${body.model} status=${response.status} ` +
        `durationMs=${Date.now() - startedAt} requestId=${response.headers.get("x-request-id") ?? "-"}`,
    );

    return normalizeQuestionAnalysis(result.data);
  }
}
