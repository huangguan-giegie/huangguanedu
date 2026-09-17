import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { executeBatchPipeline, type BatchPipelineResult, type BatchPlanner } from "./batch-pipeline.js";
import { createBatchPaths } from "./core/batch.js";
import { createRunDirectory } from "./core/run.js";
import { renderHyperframes } from "./pipeline.js";
import { MimoTtsClient } from "./providers/mimo/tts.js";
import type { TtsClient } from "./pipeline.js";

const DOCUMENT_EXTENSIONS = new Set([".doc", ".docx", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".txt", ".md"]);

export interface CourseLessonGroup {
  id: string;
  name: string;
  path: string;
  sourceFiles: string[];
  knowledgeFiles: string[];
  exerciseFiles: string[];
}

export interface CourseBatchOptions {
  cwd: string;
  sourceRoot: string;
  courseId: string;
  runRoot?: string;
  voiceSamplePath?: string;
  planner?: BatchPlanner;
  tts?: TtsClient;
  renderManim?: boolean;
  resume?: boolean;
  limit?: number;
  startId?: string;
  renderConcurrency?: number;
}

export interface CourseLessonResult {
  lesson: CourseLessonGroup;
  batchId: string;
  status: "completed" | "failed";
  videoIds: string[];
  error?: string;
}

export interface CourseBatchResult {
  courseId: string;
  manifestPath: string;
  total: number;
  completed: number;
  failed: number;
  results: CourseLessonResult[];
}

function lessonNumber(name: string): number {
  const match = name.match(/第\s*(\d+)\s*(?:讲|件)/u);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function levelPart(name: string): string {
  if (/提高/u.test(name)) return "advanced";
  if (/基础/u.test(name)) return "basic";
  return "";
}

function courseLessonId(name: string): string {
  const number = lessonNumber(name);
  const level = levelPart(name);
  if (!Number.isSafeInteger(number) || number === Number.MAX_SAFE_INTEGER) {
    return `lesson-${name.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "").toLowerCase() || "unknown"}`;
  }
  return `lesson-${String(number).padStart(2, "0")}${level ? `-${level}` : ""}`;
}

function isDocument(filePath: string): boolean {
  return DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function classifyFiles(files: string[]): Pick<CourseLessonGroup, "knowledgeFiles" | "exerciseFiles"> {
  const knowledgeFiles = files.filter((file) => /知识讲解|教案|讲解/u.test(path.basename(file)));
  const exerciseFiles = files.filter((file) => /巩固练习|练习|例题/u.test(path.basename(file)));
  return {
    knowledgeFiles: knowledgeFiles.length ? knowledgeFiles : files,
    exerciseFiles: exerciseFiles.length ? exerciseFiles : [],
  };
}

export async function discoverCourseLessons(sourceRoot: string): Promise<CourseLessonGroup[]> {
  const root = path.resolve(sourceRoot);
  const entries = await readdir(root, { withFileTypes: true });
  const lessons: CourseLessonGroup[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const nested = await readdir(directory, { withFileTypes: true });
    const sourceFiles = nested
      .filter((item) => item.isFile() && isDocument(item.name))
      .map((item) => path.join(directory, item.name))
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    if (!sourceFiles.length) continue;
    lessons.push({ id: courseLessonId(entry.name), name: entry.name, path: directory, sourceFiles, ...classifyFiles(sourceFiles) });
  }
  return lessons.sort((left, right) => {
    const byNumber = lessonNumber(left.name) - lessonNumber(right.name);
    return byNumber || left.name.localeCompare(right.name, "zh-CN");
  });
}

async function hasFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function executeCourseBatch(options: CourseBatchOptions): Promise<CourseBatchResult> {
  const lessons = await discoverCourseLessons(options.sourceRoot);
  const selected = lessons
    .filter((lesson) => !options.startId || lesson.id >= options.startId)
    .slice(0, options.limit ?? Number.MAX_SAFE_INTEGER);
  const courseRoot = path.resolve(options.runRoot ?? path.resolve(options.cwd, "runs"), options.courseId);
  const batchRoot = path.join(courseRoot, "batches");
  const sharedTts = options.tts ?? (options.voiceSamplePath
    ? new MimoTtsClient({ cacheDir: path.join(courseRoot, ".tts-cache") })
    : undefined);
  const results: CourseLessonResult[] = [];

  for (const lesson of selected) {
    const batchId = `course-${lesson.id}`;
    try {
      const batchResult: BatchPipelineResult = await executeBatchPipeline({
        cwd: options.cwd,
        sourcePath: lesson.path,
        batchId,
        runRoot: batchRoot,
        voiceSamplePath: options.voiceSamplePath,
        planner: options.planner,
        tts: sharedTts,
        renderManim: options.renderManim,
        resume: options.resume,
      });
      const batchPaths = createBatchPaths(batchRoot, batchId);
      // HyperFrames 的音频临时文件和 ffmpeg 处理目录存在共享资源，顺序渲染更可靠。
      const renderConcurrency = Math.max(1, Math.min(1, options.renderConcurrency ?? 1));
      for (let index = 0; index < batchResult.videoIds.length; index += renderConcurrency) {
        const chunk = batchResult.videoIds.slice(index, index + renderConcurrency);
        await Promise.all(chunk.map(async (videoId) => {
          const run = await createRunDirectory(batchPaths.videos, videoId);
          const outputPath = path.join(run.paths.render, `${videoId}.mp4`);
          if (options.renderManim && !(options.resume && await hasFile(outputPath))) await renderHyperframes(run);
        }));
      }
      results.push({ lesson, batchId, status: "completed", videoIds: batchResult.videoIds });
    } catch (error) {
      results.push({
        lesson,
        batchId,
        status: "failed",
        videoIds: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manifestPath = path.join(courseRoot, "course-manifest.json");
  const manifest: Omit<CourseBatchResult, "manifestPath"> & { sourceRoot: string } = {
    courseId: options.courseId,
    sourceRoot: path.resolve(options.sourceRoot),
    total: selected.length,
    completed: results.filter((item) => item.status === "completed").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(courseRoot, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return { ...manifest, manifestPath };
}
