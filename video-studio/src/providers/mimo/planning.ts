import { buildImageDataUrl } from "./media.js";
import { MimoAdapterError } from "./errors.js";
import type { LessonInput, MimoFetchOptions, Storyboard } from "./types.js";
import { z } from "zod";

const DEFAULT_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
const SYSTEM_PROMPT = [
  "你是武汉市中考数学视频编导。只返回 JSON，不要 Markdown 或解释。",
  "请根据输入生成 8-10 个 scenes，总时长贴近 targetDurationSeconds（默认 180 秒，允许误差不超过 5 秒），每个 scene 必须包含 id、type、start、duration、subtitle、narration。",
  "开头 0-15 秒必须是有趣的挑战、猜测或悬念：先让学生选择答案或预测图像变化，再揭示本节课要解决的问题。",
  "按以下 180 秒参考节奏组织内容，并按 targetDurationSeconds 等比例缩放：0-15 秒挑战题；15-40 秒生活或几何隐喻；40-80 秒函数图像；80-120 秒配方法或参数变化；120-155 秒典型中考题；155-170 秒易错点；170-180 秒总结和课程价值。",
  "如果输入提供 hook，优先把它改写成前 15 秒的口语化悬念；如果提供 cta，将它自然放在最后一个场景，强调学生收获和课程价值，不要硬性推销。",
  "narration 必须是自然、口语化但数学准确的中文，字数足以支撑 duration 对应的真实配音；subtitle 也必须是中文可见文案。不要生成英文可见文案，不要生成英文标题、英文字幕、英文旁白或英文按钮文案。",
  "讲解必须包含现象、原理、代数步骤、中考题、易错点和总结；不要只说结论。每一步都要逐步化简，公式场景尽量提供 equationSteps 数组，按实际书写顺序给出每一行，至少包含原式、关键变形、原理不等式和结论。",
  "总时长约 180 秒时，所有 narration 合计控制在 900 字到 1000 字（包含标点），中文语速按每秒约 4.5-5.2 字估算；不要为了凑时长重复解释。每个场景的旁白长度要和 duration 匹配，公式长镜头用清晰的短句解释每一步。",
  "优先设计连续流畅的几何和函数动画：坐标轴逐步出现、曲线生长、顶点移动、投影线连接、公式逐步变形；每个 scene 只表达一个核心意思。",
  "type 只能是 coordinate-plane、function-curve、parameter-sweep、challenge、equation-transform、solution-step、mistake、summary。",
  "可选字段为 formula、equation、equationSteps（字符串数组）、points（对象数组，每项含 x 和 y）、challenge、mathWarning。challenge 可包含 badge、prompt 和 options。",
  "scene 必须按时间顺序组织，duration 使用秒，数学结论要写入 mathWarning 或 narration 中。",
  '返回格式：{"scenes":[{"id":"scene-1","type":"summary","start":0,"duration":4,"subtitle":"","narration":"","formula":""}]}',
].join("\n");

function getApiKey(apiKey?: string): string {
  const key = apiKey ?? process.env.MIMO_API_KEY;
  if (!key) throw new MimoAdapterError("缺少 MIMO_API_KEY");
  return key;
}

const mimoSceneSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["coordinate-plane", "function-curve", "parameter-sweep", "challenge", "equation-transform", "solution-step", "mistake", "summary"]),
  start: z.number().min(0),
  duration: z.number().nonnegative(),
  subtitle: z.string().optional(),
  narration: z.string().min(1),
  formula: z.string().optional(),
  equation: z.string().optional(),
  equationSteps: z.array(z.string().min(1)).min(2).optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() }).passthrough()).optional(),
  challenge: z.object({
    badge: z.string().optional(),
    prompt: z.string().optional(),
    options: z.array(z.string()).optional(),
  }).optional(),
  mathWarning: z.string().optional(),
}).passthrough();

const mimoStoryboardSchema = z.union([
  z.object({ scenes: z.array(mimoSceneSchema).min(1) }).passthrough(),
  z.object({ storyboard: z.array(mimoSceneSchema).min(1) }).passthrough(),
]);

type ValidatedStoryboard = z.infer<typeof mimoStoryboardSchema>;

function validateNarrationBudget(value: ValidatedStoryboard, input: LessonInput): void {
  const scenes = (Array.isArray(value.scenes) ? value.scenes : value.storyboard) as Array<{ narration: string }>;
  const targetDurationSeconds = Number(input.targetDurationSeconds ?? 0);
  if (scenes.length < 5 || !Number.isFinite(targetDurationSeconds) || targetDurationSeconds < 150) return;
  const characterCount = scenes.reduce((total, scene) => total + Array.from(scene.narration).length, 0);
  const minimum = Math.round(targetDurationSeconds * 4.7);
  const maximum = Math.round(targetDurationSeconds * 6.7);
  if (characterCount < minimum || characterCount > maximum) {
    throw new Error(`旁白总字数 ${characterCount} 不在 ${minimum}-${maximum} 字预算内`);
  }
}

export class MimoPlanningClient {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: MimoFetchOptions & { maxRetries?: number; maxImageBase64Chars?: number } = {}) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));
    this.maxImageBase64Chars = options.maxImageBase64Chars ?? 50_000_000;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs as number : 120_000;
  }

  private readonly maxImageBase64Chars: number;

  private async fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async plan(input: LessonInput): Promise<Storyboard> {
    const key = getApiKey(this.apiKey);
    const imagePaths = Array.isArray(input.imagePaths)
      ? input.imagePaths
      : typeof input.imagePath === "string"
        ? [input.imagePath]
        : [];
    const imageParts = await Promise.all(imagePaths.map((path) => buildImageDataUrl(path, this.maxImageBase64Chars)));
    const content: Array<Record<string, unknown>> = [
      ...imageParts.map((url) => ({ type: "image_url", image_url: { url } })),
      { type: "text", text: JSON.stringify(input) },
    ];

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": key },
          body: JSON.stringify({
            model: "mimo-v2.5",
            messages: [{ role: "system", content: attempt === 0 ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n这是第 ${attempt + 1} 次重试：上一版旁白总字数没有落在预算内，请优先删去重复描述，保留公式步骤、原理和结论。` }, { role: "user", content }],
            response_format: { type: "json_object" },
          }),
        });
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
        const raw = payload.choices?.[0]?.message?.content;
        if (typeof raw !== "string") throw new Error("缺少 choices[0].message.content");
        const parsed: unknown = JSON.parse(raw);
        const validated = mimoStoryboardSchema.safeParse(parsed);
        if (!validated.success) throw new Error(`MiMo 分镜字段无效：${validated.error.issues[0]?.message ?? "结构不符合要求"}`);
        validateNarrationBudget(validated.data, input);
        return validated.data as Storyboard;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new MimoAdapterError(`Mimo 规划结构校验失败${reason}`);
  }
}
