import { buildImageDataUrl } from "./media.js";
import { MimoAdapterError } from "./errors.js";
import type { MimoFetchOptions } from "./types.js";
import { lessonMapSchema } from "../../document/lesson-map.js";
import { buildTeachingPrompt } from "../../planning/prompt.js";
import { teachingPlanSchema } from "../../planning/schema.js";
import { validateTeachingPlan } from "../../planning/validate.js";
import type { LessonMap } from "../../document/lesson-map.js";
import type { TeachingPlan } from "../../planning/types.js";
import { GeometryProgramSchema } from "../../geometry/schema.js";
import { validateGeometryProgram } from "../../geometry/validate.js";
import type { GeometryProgram } from "../../geometry/types.js";

const DEFAULT_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";

const GEOMETRY_PROMPT = [
  "你是中学数学动画分镜设计师，只返回 JSON，不要 Markdown。",
  "把教学内容转换为受约束的 GeometryProgram，不能输出任意 Python 代码。",
  "画布固定为 1080x1920；对象只使用 point、line、segment、triangle、rectangle、square、circle、label、helper-line、formula；动作只使用 draw、move-point、rotate、reflect、construct-parallel、construct-perpendicular、highlight、fill、trace、transform-formula、unsupported。",
  "每个动作必须有正数 duration；几何对象必须先定义再引用；重要推理步骤要对应一个可见动作。",
  '返回格式：{"canvas":{"width":1080,"height":1920,"background":"paper"},"objects":[],"actions":[]}',
].join("\n");

export interface TeachingInput {
  title: string;
  text: string;
  images?: string[];
  targetDurationSeconds?: number;
}

function getApiKey(apiKey?: string): string {
  const key = apiKey ?? process.env.MIMO_API_KEY;
  if (!key) throw new MimoAdapterError("缺少 MIMO_API_KEY");
  return key;
}

function lessonMapPrompt(input: TeachingInput): string {
  return [
    "你是武汉市中考数学课程设计师，只返回 JSON，不要 Markdown。",
    "请从教案中提取核心知识点、定理、前置条件、证明目标和代表例题。每道例题至少给出两个可行解法候选；如果确实没有第二种可靠解法，保留一个并让系统标记 ALT_SOLUTION_UNAVAILABLE。",
    "所有教学文字使用自然中文，数学结论必须写出条件和推理依据，不能只输出答案。",
    `教案标题：${input.title}`,
    `教案内容：${input.text}`,
    '返回格式：{"title":"","coreKnowledge":[],"theorems":[],"examples":[]}',
  ].join("\n");
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter((item): item is string => Boolean(item));
  const text = asText(value);
  if (!text) return [];
  return text.split(/[\n；]+/u).map((item) => item.trim()).filter(Boolean);
}

function firstText(record: JsonRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = asText(record[key]);
    if (value) return value;
  }
  return fallback;
}

function inferTrigger(record: JsonRecord): string {
  const direct = asText(record.trigger);
  if (direct) return direct;
  const explanation = asText(record.explanation);
  const match = explanation?.match(/题干中的[^，。；]+/u);
  return match?.[0]?.replace(/触发$/u, "") ?? "题干中的已知条件";
}

function normalizeSolution(value: unknown, index: number): JsonRecord {
  const record = asRecord(value);
  const trigger = inferTrigger(record);
  const steps = asTextList(record.steps);
  return {
    name: firstText(record, ["name", "method", "title"], `解法${index + 1}`),
    trigger,
    idea: firstText(record, ["idea", "explanation", "approach"], "根据题干条件建立关系"),
    steps: steps.length ? steps : [firstText(record, ["explanation"], "写出条件并逐步推出结论")],
    conclusion: firstText(record, ["conclusion", "answer", "result"], steps.at(-1) ?? "得到题目所求结论"),
  };
}

function unwrapJsonString(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 2 && typeof current === "string"; index += 1) {
    const text = current.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
    try {
      current = JSON.parse(text) as unknown;
    } catch {
      return current;
    }
  }
  return current;
}

function normalizeLessonMapPayload(value: unknown): unknown {
  const unwrapped = unwrapJsonString(value);
  if (unwrapped === null || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return unwrapped;
  const record = asRecord(unwrapped);
  if (!Object.keys(record).length) return value;
  const rawExamples = Array.isArray(record.examples) ? record.examples : record.example ? [record.example] : [];
  const examples = rawExamples.map((item, index) => {
    const example = asRecord(item);
    const rawSolutions = Array.isArray(example.solutions)
      ? example.solutions
      : Array.isArray(example.candidateSolutions)
        ? example.candidateSolutions
        : [];
    const solutions = rawSolutions.map((solution, solutionIndex) => normalizeSolution(solution, solutionIndex));
    const inferredClue = asText(asRecord(rawSolutions[0]).trigger) ?? inferTrigger(asRecord(rawSolutions[0]));
    return {
      ...example,
      id: firstText(example, ["id"], `example-${index + 1}`),
      statement: firstText(example, ["statement", "problem", "question", "text"], "代表例题"),
      keyClues: asTextList(example.keyClues ?? example.keyInformation).length
        ? asTextList(example.keyClues ?? example.keyInformation)
        : [inferredClue],
      solutions,
    };
  });
  const theorems = (Array.isArray(record.theorems) ? record.theorems : []).map((item) => {
    if (typeof item === "string") return { statement: item, conditions: ["题目给出的前提条件"], conclusion: item };
    const theorem = asRecord(item);
    const statement = firstText(theorem, ["statement", "theorem", "name"], "本节原理");
    return {
      statement,
      conditions: asTextList(theorem.conditions).length ? asTextList(theorem.conditions) : ["题目给出的前提条件"],
      conclusion: firstText(theorem, ["conclusion", "result"], statement),
    };
  });
  const coreKnowledge = asTextList(record.coreKnowledge ?? record.knowledge ?? record.topics);
  return {
    ...record,
    id: firstText(record, ["id"], "lesson-map"),
    title: firstText(record, ["title", "name"], "数学知识点"),
    coreKnowledge: coreKnowledge.length ? coreKnowledge : [firstText(record, ["title", "name"], "数学知识点")],
    theorems,
    examples,
  };
}

function normalizeTeachingPlanPayload(value: unknown): unknown {
  const unwrapped = unwrapJsonString(value);
  if (unwrapped === null || typeof unwrapped !== "object" || Array.isArray(unwrapped)) return unwrapped;
  const record = asRecord(unwrapped);
  const rawSolutions = Array.isArray(record.solutions)
    ? record.solutions
    : Array.isArray(record.methods)
      ? record.methods
      : [];
  const proofRecord = record.proof ? asRecord(record.proof) : undefined;
  const proof = proofRecord ? {
    ...proofRecord,
    premise: asText(proofRecord.premise) ?? asText(proofRecord.statement) ?? "题目给出的前提",
    statement: asText(proofRecord.statement) ?? asText(proofRecord.premise) ?? "本节原理",
    conditions: asTextList(proofRecord.conditions).length ? asTextList(proofRecord.conditions) : ["题目给出的前提条件"],
    construction: asTextList(proofRecord.construction).length ? asTextList(proofRecord.construction) : ["画出必要的辅助线或图形"],
    reasoningSteps: asTextList(proofRecord.reasoningSteps ?? proofRecord.steps).length ? asTextList(proofRecord.reasoningSteps ?? proofRecord.steps) : ["根据已知条件逐步推理"],
    conclusion: firstText(proofRecord, ["conclusion", "result"], "得到本节结论"),
  } : undefined;
  return {
    ...record,
    hook: firstText(record, ["hook", "opening", "question"], "先猜一猜，这道题的关键在哪里？"),
    intuition: asTextList(record.intuition ?? record.insight).length ? asTextList(record.intuition ?? record.insight) : ["先把题目条件翻译成图形和关系"],
    ...(proof ? { proof } : {}),
    solutions: rawSolutions.map((solution, index) => normalizeSolution(solution, index)),
    mistakes: asTextList(record.mistakes ?? record.commonMistakes).length ? asTextList(record.mistakes ?? record.commonMistakes) : ["结论必须带上成立条件"],
    summary: firstText(record, ["summary", "conclusion"], "抓住题干信息，再选择最短推理链"),
    ...(asText(record.cta) ? { cta: asText(record.cta) } : {}),
  };
}

export class MimoTeachingClient {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly maxImageBase64Chars: number;

  constructor(options: MimoFetchOptions & { maxRetries?: number; maxImageBase64Chars?: number } = {}) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs as number : 120_000;
    this.maxImageBase64Chars = options.maxImageBase64Chars ?? 8_000_000;
  }

  private async request(input: TeachingInput, system: string): Promise<unknown> {
    const key = getApiKey(this.apiKey);
    const imagePaths = input.images ?? [];
    const imageParts = await Promise.all(imagePaths.map((filePath) => buildImageDataUrl(filePath, this.maxImageBase64Chars)));
    const content = [
      ...imageParts.map((url) => ({ type: "image_url", image_url: { url } })),
      { type: "text", text: `标题：${input.title}\n${input.text}` },
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": key },
        body: JSON.stringify({
          model: "mimo-v2.5",
          messages: [{ role: "system", content: system }, { role: "user", content }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const raw = payload.choices?.[0]?.message?.content;
      if (typeof raw !== "string") throw new Error("缺少 choices[0].message.content");
      return unwrapJsonString(raw);
    } finally {
      clearTimeout(timeout);
    }
  }

  async mapLesson(input: TeachingInput): Promise<LessonMap> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const parsed = lessonMapSchema.safeParse(normalizeLessonMapPayload(await this.request(input, lessonMapPrompt(input))));
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "教案地图字段无效");
        return parsed.data;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new MimoAdapterError(`MiMo 教学规划失败${reason}`);
  }

  async planTeaching(input: TeachingInput): Promise<TeachingPlan> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const parsed = teachingPlanSchema.safeParse(normalizeTeachingPlanPayload(await this.request(input, buildTeachingPrompt(input))));
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "教学计划字段无效");
        const validation = validateTeachingPlan(parsed.data);
        if (!validation.plan) throw new Error(validation.findings[0]?.message ?? "教学计划校验失败");
        return validation.plan;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new MimoAdapterError(`MiMo 教学规划失败${reason}`);
  }

  async planGeometry(input: TeachingInput): Promise<GeometryProgram> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const parsed = GeometryProgramSchema.safeParse(await this.request(input, GEOMETRY_PROMPT));
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "GeometryProgram 字段无效");
        const validation = validateGeometryProgram(parsed.data as GeometryProgram);
        if (validation.errors.length) throw new Error(validation.errors[0]?.message ?? "GeometryProgram 校验失败");
        return validation.program;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new MimoAdapterError(`MiMo 教学规划失败${reason}`);
  }
}
