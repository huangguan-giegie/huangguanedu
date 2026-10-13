// Qwen（百炼）分析器：OpenAI 兼容 chat/completions，图片 URL 传输，JSON 结构化输出
// 只在服务端调用；API Key 只从环境变量读取；日志不记录图片/Prompt 原文/AI 原始响应
import { loadConfig } from "../config";
import { normalizeGeometryText } from "../latex-to-unicode";
export { repairGeometrySymbols, repairMissingAngleSymbols, repairLeadingAngleSymbols } from "../latex-to-unicode";
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

/**
 * 几何关系符号的书写规则，会拼进识别提示词。
 *
 * 背景：视觉模型读图后是以自然语言复述题目，遇到 ∥ ⊥ 这类在图中只以「作图痕迹」
 * （平行线上的箭头、直角小方框）存在的符号时会就地省略，留下两个空格。
 * 实测存库文本为 `且 DE  BC`，无 LaTeX 残留、无 U+2225 —— 缺陷发生在数据产生端，
 * 任何显示层补表都救不回来，因此必须在这里显式要求，并在下面做兜底修复与告警。
 */
const GEOMETRY_SYMBOL_RULE =
  `几何题必须保留图形给出的位置与关系符号，且只能写成标准符号：` +
  `平行 ∥、垂直 ⊥、角 ∠、三角形 △、相似 ∽、全等 ≅、圆 ⊙、度 °、因此 ∴、因为 ∵。` +
  `即使符号只出现在图形上（如两条线上的箭头、直角方框），也要写进题干文字；` +
  `绝不能用空格、多个空格、// 或 ~ 代替符号。错误写法示例：'DE  BC''CD // AB''△ADE ~ △ABC'；` +
  `正确写法示例：'DE∥BC''CD⊥AB''△ADE∽△ABC'。`;

/** 两个大写字母构成的线段/点名，如 AB、C'、A₁ */
const LETTER_TOKEN = String.raw`[A-Za-z][A-Za-z0-9'′₁₂₃₄]{0,3}`;

/** 检出「两个点名之间出现多个空格」——能机械修复的已被修掉，剩下的是真省略，交老师复核。 */
export function findMissingGeometrySymbols(text: string): string[] {
  const hits = Array.from(
    text.matchAll(new RegExp(String.raw`(${LETTER_TOKEN})\s{2,}(${LETTER_TOKEN})`, "g")),
    (match) => match[0].trim(),
  );
  return Array.from(new Set(hits));
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
      "不要输出学生姓名、手机号等身份信息。" +
      (subject === "MATH" ? `数学题请严格保留图形中的符号：${GEOMETRY_SYMBOL_RULE}` : "");
    // 按学科分支定义「思路讲解 / 解题步骤 / 最终答案」的输出要求
    const subjectInstructions =
      subject === "MATH"
        ? `  "thinkingHint": "解题思路完整讲解：先用文字完整讲一遍解题思路，再说明为什么是这个思路（明确指出从题干哪些已知条件/特征/设问推导而来）；先讲思路再列式子，不要一上来就写式子。数学符号使用标准 LaTeX：根号用 \\sqrt{x}，分数用 \\frac{a}{b}，不要写成 \\rac{x} 或类似拼写",\n` +
          `  "correctSteps": ["标准解题步骤：从第一步开始写出完整式子与关键计算，每步一个字符串；符号使用标准 LaTeX（根号 \\sqrt、分数 \\frac，不要写成 \\rac）"],\n` +
          `  "finalAnswer": "最终答案（简洁给出；根号用 \\sqrt，分数用 \\frac）",\n`
        : `  "thinkingHint": "解题思路完整讲解：先讲如何从题干关键词定位原文、理解文章结构，再说明答案依据在哪里",\n` +
          `  "correctSteps": ["标准解题步骤：按题目顺序逐题给出解题过程，每步一个字符串"],\n` +
          `  "finalAnswer": "最终答案。阅读理解题必须逐小题作答，每一小题的答案后附原文中对应的句子作为证据（引用原句），格式：第X题：〈答案〉原文依据：'……'，各小题用换行分隔",\n`;
    const recognizedQuestionRule =
      subject === "MATH"
        ? `识别出的完整题目文本。${GEOMETRY_SYMBOL_RULE}`
        : `识别出的完整题目文本`;
    const userPrompt =
      `请识别图片中的一道题，并分析学生是否写出了自己的解题过程。` +
      `当前学科：${subject}。\n\n` +
      `必须返回一个 JSON 对象，字段名使用 camelCase，包含且仅包含以下字段：\n` +
      `{\n` +
      `  "recognizedQuestion": "${recognizedQuestionRule}",\n` +
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

    return normalizeQuestionAnalysis(repairAnalysis(result.data));
  }
}

/**
 * 识别结果落库前的兜底：先修「写错成 ASCII 近似符」的符号，
 * 再对「疑似整个省略」的位置（两个点名之间出现多个空格）打老师复核标记并告警。
 * 修不了的一律交给人看，绝不静默存一道语义被改过的题。
 */
/** 两个大写字母构成的线段/点名，如 AB、C'、A₁ */
export function repairAnalysis(result: QuestionAnalysis): QuestionAnalysis {
  if (result.subject !== "MATH") return result;

  // 可机械修复的先修：ASCII 近似符、∼/∽ 混用、等号右侧丢失的 ∠、分步生成的连用标点
  const recognizedQuestion = normalizeGeometryText(result.recognizedQuestion);
  const studentWorkTranscription = result.studentWorkTranscription
    ? normalizeGeometryText(result.studentWorkTranscription)
    : result.studentWorkTranscription;
  // 能对得上的（// 、||）已被修成 ∥，剩下的多空格才是真「整个省略」，交老师核对。
  const missing = findMissingGeometrySymbols(recognizedQuestion);

  if (missing.length === 0) {
    const changed =
      recognizedQuestion !== result.recognizedQuestion ||
      studentWorkTranscription !== result.studentWorkTranscription;
    return changed ? { ...result, recognizedQuestion, studentWorkTranscription } : result;
  }

  console.warn(`[qwen] 题目疑似缺少几何关系符号：${missing.join("、")}`);
  return {
    ...result,
    recognizedQuestion,
    studentWorkTranscription,
    needsTeacherReview: true,
    reviewReasons: [
      ...result.reviewReasons,
      `AI 识别可能漏掉了图形中的平行/垂直等关系符号（${missing.slice(0, 3).join("、")}），请核对题干`,
    ],
  };
}
