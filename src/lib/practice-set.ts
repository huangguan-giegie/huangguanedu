// 错题变式练习：英语/数学多模态出题，结构化图形安全渲染，任务持久化。
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { z } from "zod";

import type { PrismaClient } from "../generated/prisma/client";
import type { SafeUser } from "./auth";
import { loadConfig } from "./config";
import { normalizeDiagramDescription } from "./diagram-description";
import { renderDiagramFromDescription } from "./diagram-renderer";
import { latexToUnicode } from "./latex-to-unicode";
import { getStorage } from "./storage";

export const PracticeQuestionSchema = z.object({
  question: z.string().min(1).max(12000),
  answer: z.string().min(1).max(8000),
  explanation: z.string().min(1).max(16000),
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
async function buildUserContent(input: PracticeSetAiInput): Promise<ContentPart[]> {
  const config = loadConfig();
  const content: ContentPart[] = [{ type: "text", text:
    `为以下${input.grade ? `${input.grade}年级` : "中小学"}错题生成变式练习。每道原题对应一道新题，总数必须为 ${input.wrongQuestions.length}。` +
    "保持原题知识点、题型与解法，改变数据、选项或情境，不能复制原题。数学答案应逐步代回验证，几何条件要自洽、不得不足或矛盾；英语保持语法考点，给出唯一答案与中文解析。" +
    `难度：${input.difficulty ?? "MEDIUM"}（EASY基础单一考点、MEDIUM常规综合、HARD多步推理）。` +
    "不要出现学生姓名、学校、手机号或其它身份信息。文本使用易读数学符号。" +
    "几何题必须在题干完整说明条件，附 diagramDescription，示意图不按比例，答案不能依赖图的像素尺寸。" +
    "先观察原图的三角形、四边形、圆与共线关系，再输出变式题和图形描述。" +
    'diagramDescription 格式：{"shapeType":"single-triangle|collinear-triangles|parallelogram|circle|intersecting-lines|function-graph","vertices":[{"label":"A"}],"collinear":[{"points":["A","B","C"]}],"polygons":[{"vertices":["A","B","C"]}],"circles":[{"center":"O","radiusPoint":"A"}],"marks":[{"type":"equal-tick","between":["A","B"],"count":1}|{"type":"right-angle","at":"A"}]}' +
    "每个引用点都须在 vertices 中。single-triangle三个顶点，parallelogram四个顶点；circle仅一个圆。" +
    '函数图必须用 shapeType="function-graph"、vertices=[]，functions:[{"expr":"y=2x^2-3x+1","domain":[-5,5]}]，keyPoints:[{"x":1,"y":0,"label":"A"}]。支持一次、二次、反比例、三角函数、根式、指数对数等一元函数，expr只使用数字、x、括号、+-*/^、sin/cos/tan/sqrt/abs/ln/log/exp/pi，不可使用代码。' +
    "若几何拓扑无法用上述结构完整表达，可输出仅基本SVG元素的 diagramSvg（svg,g,line,polyline,polygon,path,circle,ellipse,rect,text），不得使用图片、外链、脚本、样式表。配图背景白色，线条和文字使用暖灰#39323f，多条曲线可用紫色#7F77DD、绿色#1D9E75，不使用深蓝色。" +
    "纯文字计算和英语题 diagramDescription 和 diagramSvg 为 null；函数图必须给有效表达式，不能 null。" +
    '严格返回 JSON：{"title":"模拟题标题","questions":[{"question":"新题题干","answer":"完整答案","explanation":"逐步解析","diagramDescription":null,"diagramSvg":null}]}。'
  }];
  for (const [index, question] of input.wrongQuestions.entries()) {
    content.push({ type: "text", text: `原题${index + 1}（${question.subject === "ENGLISH" ? "英语" : "数学"}）：${question.recognizedQuestion}\n知识点：${question.knowledgePoints.join("、") || "综合"}\n原答案：${question.finalAnswer ?? "待复核"}\n原解法：${question.correctSteps?.join("；") ?? "无"}` });
    for (const key of question.images ?? []) {
      content.push({ type: "image_url", image_url: { url: await originalImageUrl(key), max_pixels: config.qwen.maxPixels } });
    }
  }
  return content;
}

export async function generatePracticeSetAi(input: PracticeSetAiInput, fetchImpl: typeof fetch = fetch, timeoutMs = 90000): Promise<PracticeSetAiOutput> {
  const config = loadConfig();
  if (config.qwen.mode === "mock") return {
    title: "开发模拟练习（非真实 AI 出题）",
    questions: input.wrongQuestions.map((q) => ({ question: `${q.recognizedQuestion}（开发模拟）`, answer: q.finalAnswer ?? "略", explanation: q.correctSteps?.join("\n") || q.remedialPractice[0] || "开发模拟解析", diagramDescription: null, diagramSvg: null })),
  };
  const content = await buildUserContent(input);
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
  return output.data;
}

/** AI SVG只接受基本绘图标签与属性，禁止外部资源、事件、实体及 CSS。 */
export function sanitizeDiagramSvg(input: string): string {
  // SVG 注释不具备执行能力，先移除后再检查标签，兼容模型常见的说明性注释。
  const svg = input.trim().replace(/<!--[\s\S]*?-->/g, "");
  const resourceCheck = svg.replace(/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/g, "");
  if (svg.length > 100000 || !/^<svg\b[^>]*>[\s\S]*<\/svg>$/i.test(svg) || /<!|<\?|\bon\w+\s*=|\b(?:href|style)\s*=|url\s*\(|(?:https?|file|data):|&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/i.test(resourceCheck)) throw new Error("示意图包含不允许的资源或标记");
  const tags = new Set(["svg", "g", "line", "polyline", "polygon", "path", "circle", "ellipse", "rect", "text", "tspan"]);
  const attrs = new Set(["xmlns", "width", "height", "viewbox", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "transform", "opacity", "fill-opacity", "stroke-opacity"]);
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

/** 模型偶尔忘记附函数图描述时，从题干中的 y=... 补出安全的函数图。 */
function inferFunctionDiagramDescription(question: string): unknown | null {
  if (!/函数图[像象]|函数图|图[像象]/.test(question)) return null;
  const match = question.match(/(?:^|[\s$（(])y\s*=\s*([^$，。；\n,;）)]+)/i);
  if (!match) return null;
  const expression = latexToUnicode(match[1]).replace(/\s+/g, "").replace(/^y=/i, "").replace(/X/g, "x");
  if (!expression.includes("x") || !/^[0-9a-zx()+*/^.-]+$/i.test(expression)) return null;
  return { shapeType: "function-graph", vertices: [], functions: [{ expr: `y=${expression}`, domain: [-5, 5] }] };
}

export async function persistQuestions(output: PracticeSetAiOutput) {
  const questions: { question: string; answer: string; explanation: string; imagePath: string | null }[] = [];
  const savedPaths: string[] = [];
  try {
    for (const question of output.questions) {
      let imagePath: string | null = null;
      const diagramDescription = question.diagramDescription ?? inferFunctionDiagramDescription(question.question);
      if (diagramDescription != null) {
        const description = normalizeDiagramDescription(diagramDescription);
        let svg: string;
        try {
          if (!description) throw new Error("图形结构不完整");
          svg = renderDiagramFromDescription(description);
        } catch {
          // 复杂几何保留小程序的 SVG 兜底，同样经过资源隔离校验。
          if (!question.diagramSvg?.trim()) throw new PracticeSetAiError(true, "几何或函数示意图绘制失败，请重新生成");
          svg = question.diagramSvg;
        }
        imagePath = await saveDiagramImage(svg);
      } else if (question.diagramSvg?.trim()) {
        imagePath = await saveDiagramImage(question.diagramSvg);
      } else if (/如图|下图|图中|函数图[像象]|图[像象]如/.test(question.question)) {
        throw new PracticeSetAiError(true, "题目引用示意图，但 AI 未提供图片，请重新生成");
      }
      if (imagePath) savedPaths.push(imagePath);
      questions.push({ question: latexToUnicode(question.question), answer: latexToUnicode(question.answer), explanation: latexToUnicode(question.explanation), imagePath });
    }
    return questions;
  } catch (error) {
    await Promise.allSettled(savedPaths.map((path) => getStorage().delete(path)));
    if (error instanceof PracticeSetAiError) throw error;
    throw new PracticeSetAiError(true, "几何或函数示意图绘制失败，请重新生成");
  }
}

export async function allowedPracticeStudents(prisma: PrismaClient, user: Pick<SafeUser, "id" | "role">) {
  return prisma.student.findMany({
    where: user.role === "FAMILY" ? { familyAccount: { userId: user.id } } : user.role === "TEACHER" ? { teacherAssignments: { some: { endsAt: null, teacher: { userId: user.id } } } } : {},
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

export async function serializePracticeSet(set: { id: string; studentId: string; title: string; summaryId: string | null; createdAt: Date; student: { name: string }; questions: { id: string; question: string; answer: string; explanation: string | null; imagePath: string | null }[] }) {
  return { id: set.id, studentId: set.studentId, studentName: set.student.name, title: set.title, summaryId: set.summaryId, createdAt: set.createdAt,
    questions: await Promise.all(set.questions.map(async (q) => ({ id: q.id, question: q.question, answer: q.answer, explanation: q.explanation,
      imageUrl: q.imagePath ? (await getStorage().getReadUrl(q.imagePath, 600)) ?? `/api/v1/practice-sets/images/${q.id}` : null }))),
  };
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
export async function runPracticeGenerationJob(prisma: PrismaClient, jobId: string): Promise<void> {
  // 条件更新是任务锁，after 与调度器不会重复生成同一任务。
  const claimed = await prisma.practiceGenerationJob.updateMany({ where: { id: jobId, status: "PENDING" }, data: { status: "PROCESSING", error: null } });
  if (!claimed.count) return;
  let savedQuestions: Awaited<ReturnType<typeof persistQuestions>> = [];
  try {
    const job = await prisma.practiceGenerationJob.findUniqueOrThrow({ where: { id: jobId }, include: { student: { select: { grade: true } } } });
    const ids = strings(job.wrongQuestionIds);
    const wrongQuestions = await prisma.wrongQuestion.findMany({ where: { id: { in: ids }, studentId: job.studentId, deletedAt: null, status: { in: ["PUBLISHED", "REVIEWED"] } }, include: { knowledgePointRecords: true, rawImages: { where: { deletedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } } } });
    if (!ids.length || wrongQuestions.length !== ids.length || wrongQuestions.some((q) => !q.recognizedQuestion?.trim())) throw new Error("部分错题尚未完成识别或已失效，请刷新后重试");
    wrongQuestions.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const input: PracticeSetAiInput = { grade: job.student.grade, difficulty: (job.difficulty as PracticeDifficulty | null) ?? undefined, wrongQuestions: wrongQuestions.map((q) => ({ subject: q.subject, recognizedQuestion: q.recognizedQuestion!, knowledgePoints: q.knowledgePointRecords.map((r) => r.knowledgePoint), remedialPractice: strings(q.remedialPractice), finalAnswer: q.finalAnswer, correctSteps: strings(q.correctSteps), images: q.rawImages.map((i) => i.filePath) })) };
    let output: PracticeSetAiOutput;
    try { output = await generatePracticeSetAi(input); }
    catch (error) { if (!(error instanceof PracticeSetAiError) || !error.retryable) throw error; output = await generatePracticeSetAi(input); }
    savedQuestions = await persistQuestions(output);
    await prisma.$transaction(async (tx) => {
      const set = await tx.practiceSet.create({ data: { studentId: job.studentId, title: output.title, questions: { create: savedQuestions } } });
      await tx.practiceGenerationJob.update({ where: { id: jobId }, data: { status: "DONE", error: null, resultPracticeSetId: set.id } });
    });
  } catch (error) {
    await Promise.allSettled(savedQuestions.flatMap((q) => q.imagePath ? [getStorage().delete(q.imagePath)] : []));
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
