// 错题变式练习：英语/数学多模态出题，结构化图形安全渲染，任务持久化。
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { z } from "zod";

import type { PrismaClient } from "../generated/prisma/client";
import type { SafeUser } from "./auth";
import { loadConfig } from "./config";
import { normalizeDiagramDescription } from "./diagram-description";
import { computeLayout } from "./diagram-renderer/layout-engine";
import { diagramPremiseViolations } from "./diagram-renderer/layout-engine";
import { renderDiagramFromDescription } from "./diagram-renderer";
import { latexToUnicode, normalizeGeometryText, tidyPunctuation, unconvertedCommands } from "./latex-to-unicode";
import { asStringArray } from "./mastery";
import { getStorage } from "./storage";
import { PRACTICE_DIAGRAM_HINT } from "./practice-ai";
import { compileDiagramProblem, PracticeDiagramSchema, type PracticeDiagram } from "./practice-diagram";

export const PracticeQuestionSchema = z.object({
  question: z.string().min(1).max(12000),
  answer: z.string().min(1).max(8000),
  explanation: z.string().min(1).max(16000),
  diagram: PracticeDiagramSchema.nullable().optional(),
  diagramDescription: z.unknown().nullable().optional(),
  diagramSvg: z.string().max(100000).nullable().optional(),
});
export const PracticeSetAiSchema = z.object({
  title: z.string().min(1).max(100),
  questions: z.array(PracticeQuestionSchema).min(1).max(20),
});
export type PracticeSetAiOutput = z.infer<typeof PracticeSetAiSchema>;
export type PracticeDifficulty = "EASY" | "MEDIUM" | "HARD";
export class PracticeSetAiError extends Error {
  constructor(public readonly retryable: boolean, message: string) { super(message); }
}
export interface PracticeSetWrongQuestionInput {
  subject?: "MATH" | "ENGLISH";
  recognizedQuestion: string;
  knowledgePoints: string[];
  remedialPractice: string[];
  finalAnswer: string | null;
  correctSteps: string[] | null;
  images?: string[];
}
export interface PracticeSetAiInput {
  grade?: string;
  wrongQuestions: PracticeSetWrongQuestionInput[];
  difficulty?: PracticeDifficulty;
}

/** 私有对象使用短期 URL，本地图片使用 data URL；原始路径不得离开存储目录。 */
async function originalImageUrl(key: string): Promise<string> {
  const storage = getStorage();
  const url = await storage.getReadUrl(key, 600);
  if (url) return url;
  const root = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), "storage"));
  const path = resolve(/* turbopackIgnore: true */ root, key);
  if (!path.startsWith(root + sep)) throw new Error("非法原图存储路径");
  const bytes = await readFile(path);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("原题图片过大");
  const metadata = await sharp(bytes).metadata();
  const mime = metadata.format === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; max_pixels: number } };

/** Verified diagram templates only: never ask the model to sketch geometric
 * angles and distances as unproven free-form vertices or SVG. */
const DIAGRAM_REQUIRED_HINT =
  "所有有图几何题必须使用受支持的 diagram JSON 结构，服务器会精确计算题干、答案、解析与配图，模型不得提供自绘SVG或自由坐标。" +
  PRACTICE_DIAGRAM_HINT +
  "如果没有适用的受支持diagram类型，请生成不依赖任何图的文字题：必须把全部几何条件写入题干，不得出现如图、图中、见图等措辞。" +
  "diagramDescription和diagramSvg必须为null；不得输出自绘图、图片URL或任何无法通过坐标公式反向验证的示意图。" +
  "题目必须在不看图片时依然有充足条件，所有公式和数值可计算且答案唯一。";

/** 无图模式（图形渲染不可用时的兜底）：题干必须自足，不再依赖任何图 */
const DIAGRAM_FORBIDDEN_HINT =
  "本次不生成任何示意图：diagramDescription 与 diagramSvg 一律为 null。" +
  "题干必须自足——不得出现「如图」「下图」「图中」「图略」等指代图形的表述，也不得依赖任何未在题干中说明的图形。" +
  "请把图形的结构与条件用文字完整写清楚（例如「在 Rt△ABC 中，∠C = 90°，AC = 3，BC = 4」），答案必须仅依据题干文字即可求解。";

async function buildUserContent(input: PracticeSetAiInput, diagrams = true): Promise<ContentPart[]> {
  const config = loadConfig();
  const content: ContentPart[] = [{ type: "text", text:
    `为以下${input.grade ? `${input.grade}年级` : "中小学"}错题生成变式练习。每道原题对应一道新题，总数必须为 ${input.wrongQuestions.length}。` +
    "保持原题知识点、题型与解法，改变数据、选项或情境，不能复制原题。数学答案应逐步代回验证，几何条件要自洽、不得不足或矛盾；英语保持语法考点，给出唯一答案与中文解析。" +
    "改数据时必须保持几何前提成立：折叠/对称/相似/三角比类题目只能按原题边长**等比例**缩放（如 AB:BC=3:4 可改为 6:8），**严禁交换邻边、底与高或直角边位置**——比例一变，折叠像点会落到图形外部、交点会脱离线段，题设直接失效。改完数据后逐条代回核对每个条件仍然自洽。" +
    "answer 必须与 explanation 的最终推导结果完全一致（同一个数值，禁止出现两个不同答案）。explanation 只写面向学生的解题过程与思路，不要写自我修正、核对说明或修改记录。" +
    `难度：${input.difficulty ?? "MEDIUM"}（EASY基础单一考点、MEDIUM常规综合、HARD多步推理）。` +
    "不要出现学生姓名、学校、手机号或其它身份信息。文本使用易读数学符号。" +
    (diagrams ? DIAGRAM_REQUIRED_HINT : DIAGRAM_FORBIDDEN_HINT) +
    '严格返回 JSON：{"title":"模拟题标题","questions":[{"question":"新题题干","answer":"完整答案","explanation":"逐步解析","diagram":null,"diagramDescription":null,"diagramSvg":null}]}。'
  }];
  for (const [index, question] of input.wrongQuestions.entries()) {
    content.push({ type: "text", text: `原题${index + 1}（${question.subject === "ENGLISH" ? "英语" : "数学"}）：${question.recognizedQuestion}\n知识点：${question.knowledgePoints.join("、") || "综合"}\n原答案：${question.finalAnswer ?? "待复核"}\n原解法：${question.correctSteps?.join("；") ?? "无"}` });
    for (const key of question.images ?? []) {
      content.push({ type: "image_url", image_url: { url: await originalImageUrl(key), max_pixels: config.qwen.maxPixels } });
    }
  }
  return content;
}

export interface GeneratePracticeOptions {
  /** false = 不生成示意图，题干必须自足（图形渲染失败时的兜底重试） */
  diagrams?: boolean;
}

export async function generatePracticeSetAi(input: PracticeSetAiInput, fetchImpl: typeof fetch = fetch, timeoutMs = 90000, options: GeneratePracticeOptions = {}): Promise<PracticeSetAiOutput> {
  const config = loadConfig();
  const diagrams = options.diagrams !== false;
  if (config.qwen.mode === "mock") return {
    title: "开发模拟练习（非真实 AI 出题）",
    questions: input.wrongQuestions.map((q) => ({ question: `${q.recognizedQuestion}（开发模拟）`, answer: q.finalAnswer ?? "略", explanation: q.correctSteps?.join("\n") || q.remedialPractice[0] || "开发模拟解析", diagramDescription: null, diagramSvg: null })),
  };
  const content = await buildUserContent(input, diagrams);
  let response: Response;
  try {
    response = await fetchImpl(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${config.qwen.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.qwen.model, messages: [{ role: "system", content: "你是中小学数学和英语错题变式出题助手。只输出合法 JSON，不含学生身份信息。" }, { role: "user", content }], response_format: { type: "json_object" }, enable_thinking: config.qwen.enableThinking }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { throw new PracticeSetAiError(true, "模拟题生成请求超时或连接失败，请稍后重试"); }
  if (!response.ok) throw new PracticeSetAiError(response.status === 429 || response.status >= 500, `模拟题 AI 服务暂时不可用（${response.status}）`);
  const body = await response.json().catch(() => null);
  const raw = body?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new PracticeSetAiError(true, "模拟题 AI 响应缺少题目内容");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new PracticeSetAiError(true, "模拟题 AI 未返回有效 JSON，请重试"); }
  const output = PracticeSetAiSchema.safeParse(parsed);
  if (!output.success || output.data.questions.length !== input.wrongQuestions.length) throw new PracticeSetAiError(true, "模拟题数量或格式不完整，请重新生成");
  return { ...output.data, questions: output.data.questions.map((question) => question.diagram ? { ...question, ...compileDiagramProblem(question.diagram), diagramDescription: null, diagramSvg: null } : question) };
}

/** AI SVG只接受基本绘图标签与属性，禁止外部资源、事件、实体及 CSS。 */
export function sanitizeDiagramSvg(input: string): string {
  // SVG 注释不具备执行能力，先移除后再检查标签，兼容模型常见的说明性注释。
  const svg = input.trim().replace(/<!--[\s\S]*?-->/g, "");
  const resourceCheck = svg.replace(/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/g, "");
  if (svg.length > 100000 || !/^<svg\b[^>]*>[\s\S]*<\/svg>$/i.test(svg) || /<!|<\?|\bon\w+\s*=|\b(?:href|style)\s*=|url\s*\(|(?:https?|file|data):|&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/i.test(resourceCheck)) throw new Error("示意图包含不允许的资源或标记");
  const tags = new Set(["svg", "g", "line", "polyline", "polygon", "path", "circle", "ellipse", "rect", "text", "tspan"]);
  const attrs = new Set(["xmlns", "width", "height", "viewbox", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "transform", "opacity", "fill-opacity", "stroke-opacity", "dx", "dy"]);
  for (const match of svg.matchAll(/<\/?([\w:-]+)\b([^>]*)>/g)) {
    if (!tags.has(match[1].toLowerCase())) throw new Error("示意图包含不支持的标签");
    let rest = match[2].replace(/\/\s*$/, "");
    rest = rest.replace(/([\w:-]+)\s*=\s*("[^"]*"|'[^']*')/g, (_all, attr: string, value: string) => {
      if (!attrs.has(attr.toLowerCase())) throw new Error("示意图包含不支持的属性");
      if (attr.toLowerCase() === "xmlns" && value.slice(1, -1) !== "http://www.w3.org/2000/svg") throw new Error("示意图命名空间无效");
      return "";
    });
    if (rest.trim()) throw new Error("示意图属性格式无效");
  }
  return svg;
}
export async function renderDiagramSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(sanitizeDiagramSvg(svg)), { density: 144, limitInputPixels: 4000000 }).resize({ width: 1000, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}
export async function saveDiagramImage(svg: string): Promise<string> {
  return getStorage().save(await renderDiagramSvg(svg), { extension: "png", subdir: "practice-diagrams" });
}

/**
 * 出题模型偶尔会把「自我修正过程」一起输出：改了数据后自己对账的段落
 * （**修正解析**、等等让我重新审视、重新计算……）原样进了学生看到的解析，
 * 甚至出现「参考答案是原题的值、解析算的是变式的值」这种自相矛盾。
 *
 * 这里做三件事：
 * 1. 剥离成对的 Markdown 强调符号（学生端按纯文本渲染，星号会原样露出）；
 * 2. 整段丢弃自审段落——这些段落里的推导不可信，保留它们比丢掉更危险；
 * 3. 折叠分步拼接产生的连用标点。
 */
const THINKING_LEAK_PATTERN =
  /(修正解析|修正答案|更正解析|更正一下|重新审视|再次检查|重新检查|检查一下|核对一下|重新算一遍|重新计算|让我重新|让我先|让我来分析|让我确认|等等[，,、！!？?。]|抱歉|不好意思|我之前|我先前|先前的计算|之前的计算|作为变式，保留)/;

export function sanitizeGeneratedText(text: string): string {
  // 成对星号先剥掉；要求星号后紧跟非空白，避免吃掉「2 * 3 * 4」这类乘号
  const unmarked = text
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/\*(\S[^*\n]*?\S|\S)\*/g, "$1");
  const kept = unmarked
    .split(/\n\s*\n/)
    .filter((paragraph) => !THINKING_LEAK_PATTERN.test(paragraph))
    .join("\n\n");
  return tidyPunctuation(kept).replace(/\n{3,}/g, "\n\n").trim();
}

/** 解析「a/b」分数或纯数值；带单位、根号、字母的答案返回 null（跳过校验，不误伤） */
function parseNumericValue(raw: string): number | null {
  const cleaned = raw.replace(/^\s*[a-zA-Z]\s*=\s*/, "").replace(/[。\s]+$/, "").trim();
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(cleaned);
  if (fraction) {
    const den = Number(fraction[2]);
    return den === 0 ? null : Number(fraction[1]) / den;
  }
  return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * 取解析里最后一次「单变量 = 数值」的赋值（含 (25)/(3) 这种 LaTeX 分数残留形态）。
 * 解析的收尾必然把 asked 量解出来，这是比 answer 字段更可信的最终值。
 */
function extractFinalComputedValue(explanation: string): { value: number; raw: string } | null {
  const pattern = /(?:^|[^A-Za-z0-9])([a-zA-Z])\s*=\s*\(?(\d+(?:\.\d+)?)\)?\s*\/\s*\(?(\d+(?:\.\d+)?)\)?|(?:^|[^A-Za-z0-9])([a-zA-Z])\s*=\s*(\d+(?:\.\d+)?)/g;
  let last: { value: number; raw: string } | null = null;
  for (const match of explanation.matchAll(pattern)) {
    if (match[2] !== undefined) {
      const num = Number(match[2]) / Number(match[3]);
      if (Number.isFinite(num)) last = { value: num, raw: `(${match[2]})/(${match[3]})` };
    } else if (Number.isFinite(Number(match[5]))) {
      last = { value: Number(match[5]), raw: match[5] };
    }
  }
  return last;
}

/**
 * 参考答案与解析收尾的数值对不上时，以解析推导为准回填 answer。
 * 只在两边都能解析成纯数值/分数、且确实不一致时才动手；其余形态跳过校验。
 */
export function alignAnswerWithExplanation(answer: string, explanation: string): string {
  const fromExplanation = extractFinalComputedValue(explanation);
  if (!fromExplanation) return answer;
  const fromAnswer = parseNumericValue(answer);
  if (fromAnswer === null) return answer;
  const tolerance = Math.max(1e-9, Math.abs(fromExplanation.value) * 1e-9);
  if (Math.abs(fromAnswer - fromExplanation.value) <= tolerance) return answer;
  console.warn(`[practice-set] 参考答案（${answer}）与解析推导（${fromExplanation.raw}）不一致，已按解析回填`);
  return fromExplanation.raw;
}

/** 模型偶尔忘记附函数图描述时，从题干中的 y=... 补出安全的函数图。 */
function inferFunctionDiagramDescription(question: string): unknown | null {
  if (!/函数图[像象]|函数图|图[像象]/.test(question)) return null;
  const match = question.match(/(?:^|[\s$（(])y\s*=\s*([^$，。；\n,;）)]+)/i);
  if (!match) return null;
  const expression = latexToUnicode(match[1]).replace(/\s+/g, "").replace(/^y=/i, "").replace(/X/g, "x");
  if (!expression.includes("x") || !/^[0-9a-zx()+*/^.-]+$/i.test(expression)) return null;
  return { shapeType: "function-graph", vertices: [], functions: [{ expr: `y=${expression}`, domain: [-5, 5] }] };
}

/** 题干是否指代了一张图（这类题若配不出图，只能退化为纯文字） */
const FIGURE_REFERENCE = /如图|下图|图中|图[像象]如|图略|见图/;

export interface PersistedPracticeQuestion {
  question: string;
  answer: string;
  explanation: string;
  imagePath: string | null;
  diagram?: PracticeDiagram;
}
export interface PersistQuestionsResult {
  questions: PersistedPracticeQuestion[];
  /** 需要图形但没能出图的题号（从 1 开始）。非空表示这些题只能以纯文字形式给出。 */
  diagramFailures: number[];
  /** 出题前提不成立的题号（交点/垂足落在线段延长线上）：题设与图矛盾，需要重出。 */
  premiseViolations: number[];
}

/**
 * 单题出图：结构可用就用自研渲染器确定性出图；渲染不了则退回模型给的 SVG；
 * 再不行返回 null，由调用方决定降级策略 —— 绝不因为一张图毁掉整套练习。
 */
function renderQuestionDiagram(question: { diagramSvg?: string | null }, diagramDescription: unknown, verifiedOnly = false): string | null {
  const description = normalizeDiagramDescription(diagramDescription);
  try {
    if (!description) throw new Error("图形结构不完整");
    return renderDiagramFromDescription(description);
  } catch (error) {
    // 复杂几何保留 SVG 兜底，同样经过资源隔离校验。
    if (!verifiedOnly && question.diagramSvg?.trim()) return question.diagramSvg;
    console.warn(`[practice-set] 示意图渲染失败，该题降级为纯文字：${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

export async function persistQuestions(output: PracticeSetAiOutput, options: { diagrams?: boolean; verifiedOnly?: boolean } = {}): Promise<PersistQuestionsResult> {
  const diagrams = options.diagrams !== false;
  const verifiedOnly = options.verifiedOnly === true;
  const questions: PersistedPracticeQuestion[] = [];
  const savedPaths: string[] = [];
  const diagramFailures: number[] = [];
  const premiseViolations: number[] = [];
  try {
    for (const [index, question] of output.questions.entries()) {
      if (diagrams && question.diagram) {
        // 题面、答案与 SVG 共用精确参数，不使用模型编造的数值或图片。
        questions.push({ ...compileDiagramProblem(question.diagram), imagePath: null });
        continue;
      }
      let imagePath: string | null = null;
      // 无图模式（图形渲染反复失败的兜底）下不再尝试出图，只校验题干是否真的自足。
      const candidateDescription = diagrams ? question.diagramDescription ?? inferFunctionDiagramDescription(question.question) : null;
      const checkedDescription = candidateDescription === null ? null : normalizeDiagramDescription(candidateDescription);
      const isUnverifiedGeometry = verifiedOnly && diagrams &&
        (Boolean(question.diagramSvg?.trim()) ||
          (candidateDescription !== null && checkedDescription?.shapeType !== "function-graph"));
      const diagramDescription = isUnverifiedGeometry ? null : candidateDescription;
      if (isUnverifiedGeometry) {
        // Student-facing production generation must never treat AI-drawn
        // geometry as proof that text angles, lengths, and vertex order hold.
        diagramFailures.push(index + 1);
      } else if (diagramDescription != null) {
        const svg = renderQuestionDiagram(question, diagramDescription, verifiedOnly);
        if (svg) {
          try {
            imagePath = await saveDiagramImage(svg);
          } catch (error) {
            console.warn(`[practice-set] 示意图保存失败，该题降级为纯文字：${error instanceof Error ? error.message : "unknown"}`);
          }
        }
        if (!imagePath) diagramFailures.push(index + 1);
      } else if (!verifiedOnly && diagrams && question.diagramSvg?.trim()) {
        try {
          imagePath = await saveDiagramImage(question.diagramSvg);
        } catch (error) {
          console.warn(`[practice-set] 兜底 SVG 保存失败，该题降级为纯文字：${error instanceof Error ? error.message : "unknown"}`);
          diagramFailures.push(index + 1);
        }
      } else if (FIGURE_REFERENCE.test(question.question)) {
        diagramFailures.push(index + 1);
      }
      if (diagrams && diagramDescription != null && imagePath) {
        // 出题前提断言：声明为交点/垂足的点必须真的落在线段上（而非延长线上）。
        // 落在延长线说明变式改数据时破坏了几何前提（如交换了邻边），题设与图矛盾。
        const desc = normalizeDiagramDescription(diagramDescription);
        if (desc) {
          const violations = diagramPremiseViolations(desc, computeLayout(desc));
          if (violations.length) {
            console.warn(`[practice-set] 第 ${index + 1} 题出题前提不成立：${violations.join("；")}`);
            premiseViolations.push(index + 1);
          }
        }
      }
      if (imagePath) savedPaths.push(imagePath);
      // 出题文本同样要过几何符号修复——出题模型与识别模型犯一样的错
      // （第二轮线上实例：解析里「∠B + ADC」「∠F = ACB」丢 ∠）。
      const questionText = sanitizeGeneratedText(normalizeGeometryText(latexToUnicode(question.question)));
      const explanationText = sanitizeGeneratedText(normalizeGeometryText(latexToUnicode(question.explanation)));
      const answerText = alignAnswerWithExplanation(
        sanitizeGeneratedText(normalizeGeometryText(latexToUnicode(question.answer))),
        explanationText,
      );
      questions.push({ question: questionText, answer: answerText, explanation: explanationText, imagePath });
    }
    // 转换后仍带反斜杠命令说明映射表缺项，记一条告警便于线上定位（不影响落库）
    const leftovers = Array.from(new Set(questions.flatMap((q) => [...unconvertedCommands(q.question), ...unconvertedCommands(q.answer), ...unconvertedCommands(q.explanation)])));
    if (leftovers.length) console.warn(`[practice-set] 题目文本仍有未转换的 LaTeX 命令：${leftovers.join("、")}`);
    return { questions, diagramFailures, premiseViolations };
  } catch (error) {
    await Promise.allSettled(savedPaths.map((path) => getStorage().delete(path)));
    if (error instanceof PracticeSetAiError) throw error;
    throw new PracticeSetAiError(true, "题目保存失败，请稍后重试");
  }
}

export async function allowedPracticeStudents(prisma: PrismaClient, user: Pick<SafeUser, "id" | "role">) {
  return prisma.student.findMany({
    where: user.role === "FAMILY" ? { familyAccount: { userId: user.id } } : user.role === "TEACHER" ? { teacherAssignments: { some: { endsAt: null, teacher: { userId: user.id } } } } : {},
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

export async function serializePracticeSet(set: { id: string; studentId: string; title: string; summaryId: string | null; createdAt: Date; student: { name: string }; questions: { id: string; question: string; answer: string; explanation: string | null; imagePath: string | null; diagram?: unknown; geometrySketch?: unknown; sourceWrongQuestionIds?: unknown }[] }, prisma?: PrismaClient) {
  // 学科不在练习题上，只能经sourceWrongQuestionIds 从来源错题反查。
  // 取不到时默认 MATH：公式键盘对英语题也能用，不算错配。
  const sourceIds = [
    ...new Set(
      set.questions.flatMap((q) =>
        asStringArray(q.sourceWrongQuestionIds),
      ),
    ),
  ];
  let subject: "MATH" | "ENGLISH" = "MATH";
  if (prisma && sourceIds.length > 0) {
    const sources = await prisma.wrongQuestion.findMany({
      where: { id: { in: sourceIds } },
      select: { subject: true },
    });
    // 混合学科时以英语为准（非英语即数学，取首个非 MATH 的）
    const hasEnglish = sources.some((item) => item.subject === "ENGLISH");
    subject = hasEnglish ? "ENGLISH" : "MATH";
  }

  return { id: set.id, studentId: set.studentId, studentName: set.student.name, title: set.title, summaryId: set.summaryId, createdAt: set.createdAt, subject,
    questions: await Promise.all(set.questions.map(async (q) => ({ id: q.id, question: q.question, answer: q.answer, explanation: q.explanation, diagram: q.diagram ?? null, geometrySketch: q.geometrySketch ?? null,
      imageUrl: q.imagePath ? (await getStorage().getReadUrl(q.imagePath, 600)) ?? `/api/v1/practice-sets/images/${q.id}` : null }))),
  };
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const savedImagePaths = (result: PersistQuestionsResult): string[] => result.questions.flatMap((q) => (q.imagePath ? [q.imagePath] : []));

/** AI 出题：超时、限流、格式不合规这类可重试错误再试一次，仍失败则抛出交上层。 */
async function generateWithRetry(input: PracticeSetAiInput): Promise<PracticeSetAiOutput> {
  try {
    return await generatePracticeSetAi(input);
  } catch (error) {
    if (!(error instanceof PracticeSetAiError) || !error.retryable) throw error;
    return generatePracticeSetAi(input);
  }
}

export async function runPracticeGenerationJob(prisma: PrismaClient, jobId: string): Promise<void> {
  // 条件更新是任务锁，after 与调度器不会重复生成同一任务。
  const claimed = await prisma.practiceGenerationJob.updateMany({ where: { id: jobId, status: "PENDING" }, data: { status: "PROCESSING", error: null } });
  if (!claimed.count) return;
  let savedImages: string[] = [];
  try {
    const job = await prisma.practiceGenerationJob.findUniqueOrThrow({ where: { id: jobId }, include: { student: { select: { grade: true } } } });
    const ids = strings(job.wrongQuestionIds);
    const wrongQuestions = await prisma.wrongQuestion.findMany({ where: { id: { in: ids }, studentId: job.studentId, deletedAt: null, status: { in: ["PUBLISHED", "REVIEWED"] } }, include: { knowledgePointRecords: true, rawImages: { where: { deletedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } } } });
    if (!ids.length || wrongQuestions.length !== ids.length || wrongQuestions.some((q) => !q.recognizedQuestion?.trim())) throw new Error("部分错题尚未完成识别或已失效，请刷新后重试");
    wrongQuestions.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const input: PracticeSetAiInput = { grade: job.student.grade, difficulty: (job.difficulty as PracticeDifficulty | null) ?? undefined, wrongQuestions: wrongQuestions.map((q) => ({ subject: q.subject, recognizedQuestion: q.recognizedQuestion!, knowledgePoints: q.knowledgePointRecords.map((r) => r.knowledgePoint), remedialPractice: strings(q.remedialPractice), finalAnswer: q.finalAnswer, correctSteps: strings(q.correctSteps), images: q.rawImages.map((i) => i.filePath) })) };

    // 第一级：正常出题，题目带图形。图形渲染失败不会中断整套练习。
    let output = await generateWithRetry(input);
    let persisted = await persistQuestions(output, { verifiedOnly: true });
    savedImages = savedImagePaths(persisted);

    // 第二级：变式破坏了几何前提（交点/垂足脱离线段），换一组数据整组重出；
    // 仍不成立说明这类原题确实难出安全的变式，记录后放行（矛盾已在日志中定位）。
    if (persisted.premiseViolations.length) {
      console.warn(`[practice-set] 第 ${persisted.premiseViolations.join("、")} 题出题前提不成立，重出 job=${jobId}`);
      await Promise.allSettled(savedImages.map((path) => getStorage().delete(path)));
      savedImages = [];
      output = await generateWithRetry(input);
      persisted = await persistQuestions(output, { verifiedOnly: true });
      savedImages = savedImagePaths(persisted);
      if (persisted.premiseViolations.length) {
        // Fail closed: the old flow deliberately persisted contradictory
        // geometry after a retry. Trigger no-diagram regeneration instead.
        console.error(`[practice-set] 重出后第 ${persisted.premiseViolations.join("、")} 题仍然矛盾，改为无图重出 job=${jobId}`);
        persisted.diagramFailures.push(...persisted.premiseViolations);
      }
    }

    // 第三级：确有题目配不出图时，丢弃半成品、改用「题干自足、不依赖图形」的无图模式重出一套。
    if (persisted.diagramFailures.length) {
      console.warn(`[practice-set] 第 ${persisted.diagramFailures.join("、")} 题配图失败，切换无图模式重出 job=${jobId}`);
      await Promise.allSettled(savedImages.map((path) => getStorage().delete(path)));
      savedImages = [];
      output = await generatePracticeSetAi(input, fetch, 90000, { diagrams: false });
      persisted = await persistQuestions(output, { diagrams: false });
      savedImages = savedImagePaths(persisted);
      // 第四级：改写后的题干仍在引用无法提供的图形，这套题不可用，明确失败而不是存下坏题。
      if (persisted.diagramFailures.length) throw new PracticeSetAiError(false, "题目依赖的图形无法生成，请稍后重试或减少题目数量");
    }

    await prisma.$transaction(async (tx) => {
      const set = await tx.practiceSet.create({ data: { studentId: job.studentId, title: output.title, questions: { create: persisted.questions } } });
      // 供自适应学习使用：掌握度模型靠练习题上的知识点回填，
      // 没有这一步 KnowledgeMastery 会一直是空表。
      await tx.practiceQuestion.updateMany({
        where: { practiceSetId: set.id },
        data: { sourceWrongQuestionIds: ids },
      });
      await tx.practiceGenerationJob.update({ where: { id: jobId }, data: { status: "DONE", error: null, resultPracticeSetId: set.id } });
    });
  } catch (error) {
    await Promise.allSettled(savedImages.map((path) => getStorage().delete(path)));
    const message = error instanceof PracticeSetAiError ? error.message : "模拟题生成失败，请刷新原题后重试";
    console.error(`[practice-set] 生成任务失败 job=${jobId} errorType=${error instanceof Error ? error.name : "unknown"}`);
    await prisma.practiceGenerationJob.update({ where: { id: jobId }, data: { status: "FAILED", error: message } });
  }
}

/** 后台进程重启后的兜底：超时任务给明确错误，未开始任务继续处理。 */
export async function processPracticeGenerationJobs(prisma: PrismaClient, limit = 3): Promise<number> {
  await prisma.practiceGenerationJob.updateMany({ where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }, data: { status: "FAILED", error: "生成任务被中断或超时，请重新生成" } });
  const jobs = await prisma.practiceGenerationJob.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  for (const job of jobs) await runPracticeGenerationJob(prisma, job.id);
  return jobs.length;
}
