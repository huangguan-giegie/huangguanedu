import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseLessonText } from "./core/lesson.js";
import { createRunDirectory } from "./core/run.js";
import type { Lesson, RunDirectory } from "./core/types.js";
import { MimoPlanningClient, MimoTtsClient } from "./providers/mimo/index.js";
import { renderCompositionHtml, type SceneChallenge, type Storyboard as RenderStoryboard, type StoryboardScene, type SceneType } from "./render/composition.js";
import { generateReviewReport, renderReviewReportHtml } from "./render/review.js";
import { buildWslBashCommand, normalizeWslPath } from "./infrastructure/wsl.js";

const execFileAsync = promisify(execFile);

export interface PlannerClient {
  plan(input: Record<string, unknown>): Promise<unknown>;
}

export interface TtsClient {
  synthesizeVoiceClone(request: { text: string; samplePath: string; style?: string }): Promise<{ path: string; cacheHit: boolean }>;
}

export interface VideoPipelineOptions {
  cwd: string;
  lessonPath: string;
  id?: string;
  voiceSamplePath?: string;
  planner?: PlannerClient;
  tts?: TtsClient;
  runRoot?: string;
}

export interface VideoPipelineResult {
  run: RunDirectory;
  lesson: Lesson;
  storyboard: RenderStoryboard;
  review: ReturnType<typeof generateReviewReport>;
}

const SCENE_TYPES = new Set<SceneType>([
  "coordinate-plane",
  "function-curve",
  "parameter-sweep",
  "challenge",
  "equation-transform",
  "solution-step",
  "mistake",
  "summary",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;

const asTextArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const values = value.map(asText).filter((item): item is string => Boolean(item));
  return values.length ? values : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};

const mapSceneType = (value: unknown, index: number): SceneType => {
  if (typeof value === "string" && SCENE_TYPES.has(value as SceneType)) return value as SceneType;
  if (value === "solution") return "solution-step";
  if (value === "question" || value === "answer" || value === "title") return "summary";
  return index === 0 ? "summary" : "solution-step";
};

const normalizePoints = (value: unknown): Array<{ x: number; y: number }> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const points = value
    .map((point) => {
      const record = asRecord(point);
      const x = asNumber(record.x);
      const y = asNumber(record.y);
      return x === undefined || y === undefined ? undefined : { x, y };
    })
    .filter((point): point is { x: number; y: number } => Boolean(point));
  if (!points.length) return undefined;
  const usesMathCoordinates = points.every((point) => Math.abs(point.x) <= 20 && Math.abs(point.y) <= 20);
  if (!usesMathCoordinates) return points;
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  return points.map((point) => ({
    x: Math.round(120 + ((point.x - minX) / xSpan) * 640),
    y: Math.round(400 - ((point.y - minY) / ySpan) * 240),
  }));
};

const normalizeChallenge = (value: unknown): SceneChallenge | undefined => {
  const record = asRecord(value);
  const options = Array.isArray(record.options)
    ? record.options.map(asText).filter((option): option is string => Boolean(option))
    : undefined;
  const challenge = {
    badge: asText(record.badge),
    prompt: asText(record.prompt),
    options: options?.length ? options : undefined,
  };
  return challenge.badge || challenge.prompt || challenge.options ? challenge : undefined;
};

const DEFAULT_FUNCTION_POINTS = [
  { x: 120, y: 160 },
  { x: 260, y: 300 },
  { x: 420, y: 400 },
  { x: 600, y: 300 },
  { x: 760, y: 160 },
];

export function normalizePlannerStoryboard(raw: unknown, lesson: Lesson, id: string): RenderStoryboard {
  const root = asRecord(raw);
  const rawScenes = Array.isArray(root.scenes) ? root.scenes : Array.isArray(root.storyboard) ? root.storyboard : [];
  let cursor = 0;
  const scenes: StoryboardScene[] = rawScenes.map((item, index) => {
    const scene = asRecord(item);
    const narrationBase = asText(scene.narration) ?? asText(scene.text) ?? (index === 0 ? lesson.hook ?? lesson.topic : lesson.question) ?? "请围绕这个知识点设计一道典型题。";
    const narration = index === rawScenes.length - 1 && lesson.cta && !narrationBase.includes(lesson.cta)
      ? `${narrationBase} ${lesson.cta}`
      : narrationBase;
    const duration = Math.max(0.5, asNumber(scene.duration) ?? 4);
    const start = cursor;
    cursor = start + duration;
    const sceneId = asText(scene.id) ?? `scene-${index + 1}`;
    const type = mapSceneType(scene.type ?? scene.kind, index);
    const normalizedPoints = normalizePoints(scene.points);
    const sceneEquationSteps = asTextArray(scene.equationSteps) ?? asTextArray(scene.steps);
    const equationSteps = type === "equation-transform" && lesson.equationSteps && (!sceneEquationSteps || sceneEquationSteps.length < lesson.equationSteps.length)
      ? lesson.equationSteps
      : sceneEquationSteps;
    return {
      id: sceneId,
      type,
      start,
      duration,
      subtitle: asText(scene.subtitle) ?? narration,
      formula: asText(scene.formula) ?? asText(scene.equation),
      equationSteps,
      narration,
      points: (type === "function-curve" || type === "parameter-sweep") && (normalizedPoints?.length ?? 0) < 2
        ? DEFAULT_FUNCTION_POINTS
        : normalizedPoints,
      mathWarning: asText(scene.mathWarning) ?? asText(scene.warning),
      challenge: normalizeChallenge(scene.challenge) ?? (index === 0 && lesson.hook
        ? { badge: "先猜 3 秒", prompt: lesson.hook, options: ["先猜一猜", "看图像", "看公式"] }
        : undefined),
    };
  });

  if (!scenes.length) {
    scenes.push({
      id: "scene-1",
      type: "summary",
      start: 0,
      duration: 4,
      subtitle: lesson.title ?? lesson.topic ?? "数学讲解",
      narration: lesson.question ?? "请围绕这个知识点设计一道典型题。",
      formula: lesson.answer,
      mathWarning: "MiMo 未返回有效分镜，已使用基础分镜兜底。",
    });
  }
  return { id, title: lesson.title ?? lesson.topic ?? "数学讲解", scenes };
}

const textLength = (value: string): number => Array.from(value).length;

const trimNarrationToBudget = (value: string, budget: number): string => {
  if (textLength(value) <= budget) return value;
  const sentences = value.match(/[^。！？!?；;]+[。！？!?；;]?/gu) ?? [value];
  let result = "";
  for (const sentence of sentences) {
    if (textLength(result) + textLength(sentence) > budget) break;
    result += sentence;
  }
  if (!result) {
    const characters = Array.from(value).slice(0, Math.max(1, budget - 1));
    result = `${characters.join("")}。`;
  }
  return result;
};

export function compactStoryboardNarration(storyboard: RenderStoryboard, targetDurationSeconds: number): RenderStoryboard {
  const deduplicated = deduplicateStoryboardNarration(storyboard);
  const targetCharacters = Math.max(360, Math.round(targetDurationSeconds * 5));
  const totalCharacters = deduplicated.scenes.reduce((sum, scene) => sum + textLength(scene.narration ?? scene.subtitle ?? ""), 0);
  if (totalCharacters <= targetCharacters) return deduplicated;

  let remainingCharacters = targetCharacters;
  const remainingScenes = deduplicated.scenes.length;
  const scenes = deduplicated.scenes.map((scene, index) => {
    const originalNarration = scene.narration ?? scene.subtitle ?? "数学讲解";
    const remainingSceneCount = remainingScenes - index - 1;
    const proportionalBudget = Math.round(targetCharacters * textLength(originalNarration) / totalCharacters);
    const reserve = remainingSceneCount * 28;
    const budget = index === remainingScenes - 1
      ? remainingCharacters
      : Math.min(Math.max(28, proportionalBudget), Math.max(28, remainingCharacters - reserve));
    const narration = trimNarrationToBudget(originalNarration, budget);
    remainingCharacters = Math.max(0, remainingCharacters - textLength(narration));
    return {
      ...scene,
      narration,
      subtitle: scene.subtitle === originalNarration ? narration : scene.subtitle,
    };
  });
  return { ...storyboard, scenes };
}

function sentenceKey(value: string): string {
  return value.replace(/[\s。！？!?；;，,、]/gu, '').trim();
}

export function deduplicateStoryboardNarration(storyboard: RenderStoryboard): RenderStoryboard {
  const seen = new Set<string>();
  const scenes = storyboard.scenes.map((scene) => {
    const original = scene.narration ?? scene.subtitle ?? '';
    const sentences = original.match(/[^。！？!?；;]+[。！？!?；;]?/gu) ?? [original];
    const kept = sentences.filter((sentence) => {
      const key = sentenceKey(sentence);
      if (key.length < 4 || !seen.has(key)) {
        if (key.length >= 4) seen.add(key);
        return true;
      }
      return false;
    });
    const narration = (kept.join('').replace(/\s{2,}/gu, ' ').trim() || '继续看下一步。');
    return {
      ...scene,
      narration,
      subtitle: scene.subtitle === original ? narration : scene.subtitle,
    };
  });
  return { ...storyboard, scenes };
}

async function readLesson(cwd: string, lessonPath: string): Promise<Lesson> {
  const absolutePath = path.resolve(cwd, lessonPath);
  return parseLessonText(await readFile(absolutePath, "utf8"), absolutePath);
}

function plannerInput(lesson: Lesson, lessonPath: string): Record<string, unknown> {
  const imagePaths = lesson.imagePath ? [path.resolve(path.dirname(lessonPath), lesson.imagePath)] : [];
  return { ...lesson, objective: lesson.topic ?? lesson.title, imagePaths };
}

async function probeDuration(filePath: string, fallback: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath,
    ]);
    const duration = Number(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : fallback;
  } catch {
    // TTS 默认输出 WAV；即使 Windows 没有把 ffprobe 加入 PATH，也能从 WAV 头读取真实时长。
    try {
      const bytes = await readFile(filePath);
      if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return fallback;
      const byteRate = bytes.readUInt32LE(28);
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const chunkId = bytes.toString("ascii", offset, offset + 4);
        const chunkSize = bytes.readUInt32LE(offset + 4);
        if (chunkId === "data" && byteRate > 0) return chunkSize / byteRate;
        offset += 8 + chunkSize + (chunkSize % 2);
      }
    } catch {
      // 读取失败时使用分镜预估时长，并由审查报告提示风险。
    }
    return fallback;
  }
}

export async function attachAudio(
  run: RunDirectory,
  storyboard: RenderStoryboard,
  tts: TtsClient | undefined,
  voiceSamplePath: string | undefined,
): Promise<RenderStoryboard> {
  if (!tts) return storyboard;
  const scenes: StoryboardScene[] = [];
  let cursor = 0;
  for (const [index, scene] of storyboard.scenes.entries()) {
    const narration = scene.narration ?? scene.subtitle ?? "";
    const start = cursor;
    let duration = scene.duration;
    let audio = scene.audio;
    if (narration && voiceSamplePath) {
      const audioResult = await tts.synthesizeVoiceClone({ text: narration, samplePath: voiceSamplePath });
      const safeSceneId = scene.id.replace(/[^a-zA-Z0-9_-]/g, "-") || `scene-${index + 1}`;
      const fileName = `${index + 1}-${safeSceneId}.wav`;
      const target = path.join(run.paths.audio, fileName);
      const previewTarget = path.join(run.paths.preview, "audio", fileName);
      if (path.resolve(audioResult.path) !== path.resolve(target)) await copyFile(audioResult.path, target);
      await mkdir(path.dirname(previewTarget), { recursive: true });
      if (path.resolve(target) !== path.resolve(previewTarget)) await copyFile(target, previewTarget);
      duration = await probeDuration(target, duration);
      audio = { src: path.relative(run.paths.preview, previewTarget).replaceAll(path.sep, "/"), start, duration };
    }
    scenes.push({ ...scene, start, duration, audio });
    cursor = start + duration;
  }
  return { ...storyboard, scenes };
}

export async function executeVideoPipeline(options: VideoPipelineOptions): Promise<VideoPipelineResult> {
  const lessonPath = path.resolve(options.cwd, options.lessonPath);
  const lesson = await readLesson(options.cwd, options.lessonPath);
  const id = options.id ?? path.basename(lessonPath).replace(/\.(yaml|yml|json)$/i, "");
  const run = await createRunDirectory(options.runRoot ?? path.resolve(options.cwd, "runs"), id);
  const planner = options.planner ?? new MimoPlanningClient();
  const planned = await planner.plan(plannerInput(lesson, lessonPath));
  const baseStoryboard = normalizePlannerStoryboard(planned, lesson, id);
  const voiceSamplePath = options.voiceSamplePath ? path.resolve(options.cwd, options.voiceSamplePath) : undefined;
  const tts = options.tts ?? (voiceSamplePath ? new MimoTtsClient({ cacheDir: path.join(run.paths.audio, ".cache") }) : undefined);
  const narrationTargetSeconds = Math.min(165, lesson.targetDurationSeconds ?? 120);
  const storyboard = await attachAudio(run, compactStoryboardNarration(baseStoryboard, narrationTargetSeconds), tts, voiceSamplePath);
  await writeFile(run.paths.lesson, `${JSON.stringify(lesson, null, 2)}\n`, "utf8");
  await writeFile(run.paths.storyboard, `${JSON.stringify(storyboard, null, 2)}\n`, "utf8");
  const composition = renderCompositionHtml(storyboard);
  await writeFile(path.join(run.paths.preview, "index.html"), composition, "utf8");
  const review = generateReviewReport(storyboard, lesson.targetDurationSeconds);
  await writeFile(path.join(run.paths.review, "report.json"), review.json, "utf8");
  await writeFile(path.join(run.paths.review, "report.html"), renderReviewReportHtml(review), "utf8");
  return { run, lesson, storyboard, review };
}

const FINAL_WIDTH = 720;
const FINAL_HEIGHT = 1280;
const FINAL_FPS = 24;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function transcodeForMobile(sourcePath: string, outputPath: string): Promise<void> {
  const filter = `scale=${FINAL_WIDTH}:${FINAL_HEIGHT}:flags=lanczos`;
  if (process.platform === "win32") {
    const command = [
      "ffmpeg -y",
      `-i ${shellQuote(normalizeWslPath(sourcePath))}`,
      `-vf ${shellQuote(filter)}`,
      `-r ${FINAL_FPS}`,
      "-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p",
      "-c:a aac -b:a 128k -movflags +faststart",
      shellQuote(normalizeWslPath(outputPath)),
    ].join(" ");
    const [executable, ...args] = buildWslBashCommand(command);
    await execFileAsync(executable, args, { windowsHide: true });
    return;
  }
  await execFileAsync("ffmpeg", [
    "-y", "-i", sourcePath, "-vf", filter, "-r", String(FINAL_FPS),
    "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath,
  ]);
}

export async function renderHyperframes(run: RunDirectory): Promise<string> {
  const outputPath = path.join(run.paths.render, `${run.id}.mp4`);
  const masterOutputPath = path.join(run.paths.render, `${run.id}.master.mp4`);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  let fps = String(FINAL_FPS);
  try {
    const storyboard = JSON.parse(await readFile(run.paths.storyboard, "utf8")) as { format?: string };
    if (storyboard.format === "vertical") fps = String(FINAL_FPS);
  } catch {
    // 旧运行目录没有分镜时沿用横屏默认帧率。
  }
  await execFileAsync(npx, [
    "hyperframes", "render", run.paths.preview,
    "--output", masterOutputPath,
    "--fps", fps,
    "--workers", "1",
    "--low-memory-mode",
  ], {
    cwd: run.paths.preview,
    shell: process.platform === "win32",
  });
  await transcodeForMobile(masterOutputPath, outputPath);
  await rm(masterOutputPath, { force: true });
  return outputPath;
}
