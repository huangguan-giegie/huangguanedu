import { buildImageDataUrl } from "../mimo/media.js";
import { lessonMapSchema } from "../../document/lesson-map.js";
import { buildTeachingPrompt } from "../../planning/prompt.js";
import { teachingPlanSchema } from "../../planning/schema.js";
import { validateTeachingPlan } from "../../planning/validate.js";
import type { LessonMap } from "../../document/lesson-map.js";
import type { TeachingPlan } from "../../planning/types.js";
import { GeometryProgramSchema } from "../../geometry/schema.js";
import { validateGeometryProgram } from "../../geometry/validate.js";
import type { GeometryProgram } from "../../geometry/types.js";
import { configureProviderNetwork } from "../network.js";

configureProviderNetwork();

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL = "qwen-plus";

export class QwenAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QwenAdapterError";
  }
}

export interface QwenTeachingInput {
  title: string;
  text: string;
  images?: string[];
  targetDurationSeconds?: number;
}

export interface QwenFetchOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  maxImageBase64Chars?: number;
}

function getApiKey(apiKey?: string): string {
  const key = [apiKey, process.env.QWEN_API_KEY, process.env.DASHSCOPE_API_KEY]
    .find((value) => typeof value === "string" && value.trim());
  if (!key) throw new QwenAdapterError("缺少 QWEN_API_KEY 或 DASHSCOPE_API_KEY");
  return key.trim();
}

function unwrapJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

const LESSON_MAP_PROMPT = "你是武汉市中考数学教案分析师。只返回 JSON，不要 Markdown。输出 LessonMap，提取核心知识点、定理条件、证明目标和代表例题；例题要给出题干触发信息和可靠解法。所有内容使用中文。";
const TEACHING_PROMPT = "你是武汉市中考数学课程设计师。只返回 JSON，不要 Markdown。输出 TeachingPlan，必须包含趣味引入、直觉、证明（如适用）、主解法和替代解法、错误提醒、总结。每种解法都要说明题干触发信息、思路和逐步推导；没有可靠替代法时保留一种并说明。所有内容使用中文。";
const GEOMETRY_PROMPT = "你是中学数学动画分镜设计师。只返回 JSON，不要 Markdown。输出 GeometryProgram，只能使用受约束的点、线段、三角形、矩形、正方形、圆、标签、辅助线、公式及受支持动作；对象先定义后引用，坐标必须在 1080x1920 画布内，动作 duration 必须为正数。不要输出 Python 或任意代码。";

function promptWithInput(system: string, input: QwenTeachingInput): string {
  return `${system}\n标题：${input.title}\n内容：${input.text}\n目标时长：${input.targetDurationSeconds ?? 180} 秒`;
}

function schemaError(message: string): Error {
  return new Error(message);
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter((item): item is string => Boolean(item));
  const text = textValue(value);
  return text ? [text] : [];
}

function firstValue(record: JsonRecord, keys: string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
}

export function normalizeQwenLessonMap(value: unknown, input: QwenTeachingInput): unknown {
  if (!isRecord(value)) return value;
  const wrapped = firstValue(value, ["LessonMap", "lessonMap", "lesson_map"]);
  const source = isRecord(wrapped) ? wrapped : value;
  if (source.title !== undefined || source.coreKnowledge !== undefined) return source;

  const coreKnowledge = textList(firstValue(source, ["核心知识点", "核心知识点列表", "知识点"]));
  if (!coreKnowledge.length) return value;

  const conditions = textList(firstValue(source, ["定理条件", "条件", "前置条件"]));
  const conclusion = textValue(firstValue(source, ["证明目标", "结论", "定理结论"]));
  const theorems = conditions.length && conclusion
    ? [{ statement: conclusion, conditions, conclusion }]
    : [];

  const rawExample = firstValue(source, ["代表例题", "典型例题", "example"]);
  const example = isRecord(rawExample) ? rawExample : undefined;
  const clue = textValue(firstValue(example ?? {}, ["题干触发信息", "题干关键信息", "关键信息", "keyClues"]));
  const reliableSolution = textValue(firstValue(example ?? {}, ["可靠解法", "主解法", "解法思路", "solution"]));
  const exampleStatement = textValue(firstValue(example ?? {}, ["题干", "题目", "statement"])) ?? input.text.trim();
  const examples = reliableSolution
    ? [{
      id: "example-1",
      statement: exampleStatement,
      keyClues: [clue ?? "从题干识别正方形、动点或等长条件"],
      solutions: [{
        name: "主解法",
        trigger: clue ?? "题干给出正方形、动点或等长条件",
        idea: reliableSolution,
        steps: [reliableSolution],
        conclusion: conclusion ?? "得到题目结论",
      }],
    }]
    : [];

  return {
    id: "qwen-lesson-map",
    title: input.title,
    coreKnowledge,
    theorems,
    examples,
  };
}

function unwrapNamedObject(value: unknown, names: string[]): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  const wrapped = firstValue(value, names);
  return isRecord(wrapped) ? wrapped : value;
}

function normalizeSolution(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    name: textValue(firstValue(value, ["name", "名称", "解法名称"])) ?? "解法",
    trigger: textValue(firstValue(value, ["trigger", "触发信息", "题干信息"])) ?? "从题干条件识别方法",
    idea: textValue(firstValue(value, ["idea", "思路", "核心思路"])) ?? "按条件推导",
    steps: textList(firstValue(value, ["steps", "步骤", "推导步骤"])),
    conclusion: textValue(firstValue(value, ["conclusion", "结论"])) ?? "得到题目结论",
  };
}

export function normalizeQwenTeachingPlan(value: unknown): unknown {
  const source = unwrapNamedObject(value, ["TeachingPlan", "teachingPlan", "teaching_plan", "教学计划"]);
  if (!source) return value;
  const rawProof = firstValue(source, ["proof", "证明", "原理"]);
  const proofSource = typeof rawProof === "string" ? { statement: rawProof } : isRecord(rawProof) ? rawProof : undefined;
  const proof = proofSource
    ? {
      ...proofSource,
      premise: textValue(firstValue(proofSource, ["premise", "前提", "已知"])) ?? "已知条件",
      statement: textValue(firstValue(proofSource, ["statement", "定理", "证明目标"])) ?? "证明结论",
      conditions: textList(firstValue(proofSource, ["conditions", "条件", "定理条件"])) ,
      construction: textList(firstValue(proofSource, ["construction", "构造", "作图"])),
      reasoningSteps: textList(firstValue(proofSource, ["reasoningSteps", "reasoning_steps", "证明步骤", "推理步骤"])),
      conclusion: textValue(firstValue(proofSource, ["conclusion", "结论"])) ?? "得到结论",
    }
    : undefined;
  const rawSolutions = firstValue(source, ["solutions", "solution", "解法", "解题思路"]);
  const solutionList = Array.isArray(rawSolutions) ? rawSolutions : rawSolutions ? [rawSolutions] : [];
  return {
    ...source,
    hook: textValue(firstValue(source, ["hook", "引入", "趣味引入"])) ?? "先猜一猜，答案会是什么？",
    intuition: textList(firstValue(source, ["intuition", "直觉", "直观理解"])),
    ...(proof ? { proof } : {}),
    solutions: solutionList.map(normalizeSolution),
    mistakes: textList(firstValue(source, ["mistakes", "易错点", "常见错误"])),
    summary: textValue(firstValue(source, ["summary", "总结", "方法总结"])) ?? "把题干信息转成可验证的条件。",
    ...(textValue(firstValue(source, ["cta", "课程引导"])) ? { cta: textValue(firstValue(source, ["cta", "课程引导"])) } : {}),
  };
}

export function normalizeQwenGeometryProgram(value: unknown): unknown {
  const source = unwrapNamedObject(value, ["GeometryProgram", "geometryProgram", "geometry_program", "几何程序"]);
  if (!source || !isRecord(source.canvas)) return value;
  const background = source.canvas.background === "paper" || source.canvas.background === "dark"
    ? source.canvas.background
    : "dark";
  return {
    ...source,
    canvas: { ...source.canvas, width: 1080, height: 1920, background },
  };
}

export class QwenTeachingClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxImageBase64Chars: number;

  constructor(options: QwenFetchOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? process.env.QWEN_BASE_URL ?? DEFAULT_BASE_URL;
    this.model = options.model ?? process.env.QWEN_MODEL ?? DEFAULT_MODEL;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs as number : 120_000;
    this.maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));
    this.maxImageBase64Chars = options.maxImageBase64Chars ?? 8_000_000;
  }

  private async request(input: QwenTeachingInput, system: string): Promise<unknown> {
    const key = getApiKey(this.apiKey);
    const imageParts = await Promise.all((input.images ?? []).map((path) => buildImageDataUrl(path, this.maxImageBase64Chars)));
    const content = [
      ...imageParts.map((url) => ({ type: "image_url", image_url: { url } })),
      { type: "text", text: `标题：${input.title}\n${input.text}` },
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: promptWithInput(system, input) },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const raw = payload.choices?.[0]?.message?.content;
      if (raw === undefined || raw === null) throw schemaError("缺少 choices[0].message.content");
      return unwrapJson(raw);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async run<T>(input: QwenTeachingInput, system: string, parse: (value: unknown) => T, label: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return parse(await this.request(input, system));
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new QwenAdapterError(`Qwen ${label}失败${reason}`);
  }

  async mapLesson(input: QwenTeachingInput): Promise<LessonMap> {
    return this.run(input, LESSON_MAP_PROMPT, (value) => {
      const parsed = lessonMapSchema.safeParse(normalizeQwenLessonMap(value, input));
      if (!parsed.success) throw schemaError(parsed.error.issues[0]?.message ?? "LessonMap 结构无效");
      return parsed.data;
    }, "教案分析");
  }

  async planTeaching(input: QwenTeachingInput): Promise<TeachingPlan> {
    return this.run(input, `${TEACHING_PROMPT}\n${buildTeachingPrompt(input)}`, (value) => {
      const parsed = teachingPlanSchema.safeParse(normalizeQwenTeachingPlan(value));
      if (!parsed.success) throw schemaError(parsed.error.issues[0]?.message ?? "TeachingPlan 结构无效");
      const validation = validateTeachingPlan(parsed.data);
      if (!validation.plan) throw schemaError(validation.findings[0]?.message ?? "TeachingPlan 校验失败");
      return validation.plan;
    }, "教学规划");
  }

  async planGeometry(input: QwenTeachingInput): Promise<GeometryProgram> {
    return this.run(input, GEOMETRY_PROMPT, (value) => {
      const parsed = GeometryProgramSchema.safeParse(normalizeQwenGeometryProgram(value));
      if (!parsed.success) throw schemaError(parsed.error.issues[0]?.message ?? "GeometryProgram 结构无效");
      const validation = validateGeometryProgram(parsed.data as GeometryProgram);
      if (validation.errors.length) throw schemaError(validation.errors[0]?.message ?? "GeometryProgram 校验失败");
      return validation.program;
    }, "几何规划");
  }
}
