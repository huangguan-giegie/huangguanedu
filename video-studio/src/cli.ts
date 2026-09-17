import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeVideoPipeline,
  renderHyperframes,
  type PlannerClient,
  type TtsClient,
} from "./pipeline.js";
import {
  executeBatchPipeline,
  type BatchPlanner,
} from "./batch-pipeline.js";
import { createBatchPaths } from "./core/batch.js";
import { createRunDirectory } from "./core/run.js";
import { generateReviewReport, renderReviewReportHtml } from "./render/review.js";
import { renderCompositionHtml, type Storyboard } from "./render/composition.js";
import { buildWslSetupCommand } from "./infrastructure/wsl.js";

export type CliCommand = "generate" | "preview" | "render" | "review" | "make" | "setup";

export interface CliArgs {
  command: CliCommand;
  lessonPath?: string;
  sourcePath?: string;
  id?: string;
  batchId?: string;
  voiceSamplePath?: string;
  resume?: boolean;
}

export interface CliDependencies {
  planner?: PlannerClient;
  batchPlanner?: BatchPlanner;
  tts?: TtsClient;
}

const COMMANDS = new Set<CliCommand>(["generate", "preview", "render", "review", "make", "setup"]);

export function parseCliArgs(argv: string[]): CliArgs {
  const command = argv[0] as CliCommand | undefined;
  if (!command || !COMMANDS.has(command)) {
    throw new Error("命令必须是 generate、preview、render、review、make 或 setup");
  }

  const result: CliArgs = { command };
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === "--resume") {
      result.resume = true;
      continue;
    }
    if (option === "--lesson") result.lessonPath = requireValue(option, value);
    else if (option === "--source") result.sourcePath = requireValue(option, value);
    else if (option === "--id") result.id = requireValue(option, value);
    else if (option === "--batch-id") result.batchId = requireValue(option, value);
    else if (option === "--voice-sample") result.voiceSamplePath = requireValue(option, value);
    else throw new Error(`未知参数：${option}`);
    index += 1;
  }
  return result;
}

function requireValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw new Error(`参数 ${option} 缺少值`);
  return value;
}

function normalizePrefixedPath(cwd: string, input: string): string {
  if (path.basename(path.resolve(cwd)).toLowerCase() !== "video-studio") return input;
  return input.replace(/^video-studio[\\/]/i, "");
}

function safeIdFromName(value: string, fallback = "lesson"): string {
  const id = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || fallback;
}

function runPaths(cwd: string, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("非法 run id");
  const root = path.resolve(cwd, "runs", id);
  return {
    id,
    paths: {
      root,
      lesson: path.join(root, "lesson.json"),
      storyboard: path.join(root, "storyboard.json"),
      audio: path.join(root, "audio"),
      preview: path.join(root, "preview"),
      render: path.join(root, "render"),
      review: path.join(root, "review"),
    },
  } as const;
}

async function writePreviewAndReviewForRun(
  run: ReturnType<typeof runPaths>,
  targetDurationSeconds?: number,
): Promise<void> {
  const storyboard = JSON.parse(await readFile(run.paths.storyboard, "utf8")) as Storyboard;
  await mkdir(run.paths.preview, { recursive: true });
  await mkdir(run.paths.review, { recursive: true });
  await writeFile(path.join(run.paths.preview, "index.html"), renderCompositionHtml(storyboard), "utf8");
  const target = targetDurationSeconds ?? storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const report = generateReviewReport(storyboard, target);
  await writeFile(path.join(run.paths.review, "report.json"), report.json, "utf8");
  await writeFile(path.join(run.paths.review, "report.html"), renderReviewReportHtml(report), "utf8");
}

async function writePreviewAndReview(cwd: string, id: string): Promise<void> {
  const run = runPaths(cwd, id);
  let targetDurationSeconds: number | undefined;
  try {
    const lesson = JSON.parse(await readFile(run.paths.lesson, "utf8")) as { targetDurationSeconds?: number };
    targetDurationSeconds = lesson.targetDurationSeconds;
  } catch {
    // 旧运行目录可能没有 lesson.json，直接使用分镜总时长。
  }
  await writePreviewAndReviewForRun(run, targetDurationSeconds);
}

async function readBatchManifest(cwd: string, batchId: string): Promise<{ videoIds: string[] }> {
  const batch = createBatchPaths(path.resolve(cwd, "runs"), batchId);
  const manifest = JSON.parse(await readFile(batch.manifest, "utf8")) as { videoIds?: unknown };
  if (!Array.isArray(manifest.videoIds) || !manifest.videoIds.every((id) => typeof id === "string")) {
    throw new Error(`批次 ${batchId} 的 manifest.json 缺少 videoIds`);
  }
  return { videoIds: manifest.videoIds };
}

async function runBatchCommand(cwd: string, command: "preview" | "review" | "render", batchId: string): Promise<void> {
  const batch = createBatchPaths(path.resolve(cwd, "runs"), batchId);
  const manifest = await readBatchManifest(cwd, batchId);
  for (const videoId of manifest.videoIds) {
    const run = await createRunDirectory(batch.videos, videoId);
    if (command === "render") {
      await renderHyperframes(run);
    } else {
      await writePreviewAndReviewForRun(run, 180);
    }
  }
}

export async function runCli(argv: string[], cwd = process.cwd(), dependencies: CliDependencies = {}): Promise<void> {
  const args = parseCliArgs(argv);

  if (args.command === "setup") {
    console.log("请先在管理员 PowerShell 执行：wsl --install -d Ubuntu-24.04");
    console.log("重启后，在 WSL 中执行：");
    console.log(buildWslSetupCommand());
    if (args.voiceSamplePath) console.log(`声音样本：${args.voiceSamplePath}`);
    return;
  }

  if (args.command === "generate" || args.command === "make") {
    if (args.sourcePath) {
      const sourcePath = normalizePrefixedPath(cwd, args.sourcePath);
      const batchId = args.batchId ?? args.id ?? safeIdFromName(path.basename(sourcePath));
      const result = await executeBatchPipeline({
        cwd,
        sourcePath,
        batchId,
        voiceSamplePath: args.voiceSamplePath ? normalizePrefixedPath(cwd, args.voiceSamplePath) : undefined,
        planner: dependencies.batchPlanner,
        tts: dependencies.tts,
        renderManim: args.command === "make",
        resume: args.resume,
      });

      if (args.command === "make") {
        const batch = createBatchPaths(path.resolve(cwd, "runs"), result.batchId);
        for (const videoId of result.videoIds) {
          await renderHyperframes(await createRunDirectory(batch.videos, videoId));
        }
      }
      return;
    }

    if (!args.lessonPath) throw new Error("缺少 --lesson 或 --source 参数");
    const result = await executeVideoPipeline({
      cwd,
      lessonPath: normalizePrefixedPath(cwd, args.lessonPath),
      id: args.id,
      voiceSamplePath: args.voiceSamplePath ? normalizePrefixedPath(cwd, args.voiceSamplePath) : undefined,
      planner: dependencies.planner,
      tts: dependencies.tts,
    });
    if (args.command === "make") await renderHyperframes(result.run);
    return;
  }

  if (args.batchId) {
    await runBatchCommand(cwd, args.command, args.batchId);
    return;
  }

  if (!args.id) throw new Error(`${args.command} 命令缺少 --id 或 --batch-id 参数`);
  const run = runPaths(cwd, args.id);
  if (args.command === "preview" || args.command === "review") await writePreviewAndReview(cwd, args.id);
  if (args.command === "render") await renderHyperframes(run);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
