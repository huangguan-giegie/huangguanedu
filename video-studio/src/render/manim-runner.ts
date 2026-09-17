import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { buildWslBashCommand, normalizeWslPath } from "../infrastructure/wsl.js";

const execFileAsync = promisify(execFile);
const MANIM_BIN = "/home/huangguan/.video-studio-venv/bin/manim";

export interface ManimRenderOptions {
  scriptPath: string;
  mediaDir: string;
  quality?: "low" | "medium" | "high";
}

function shellPath(value: string): string {
  return /[\s'"()&|;$]/.test(value) ? `'${value.replaceAll("'", "'\\''")}'` : value;
}

export function buildWslCommand(
  scriptPath: string,
  mediaDir: string,
  quality: "low" | "medium" | "high" = "high",
): string[] {
  const qualityFlag = quality === "low" ? "-ql" : quality === "medium" ? "-qm" : "-qh";
  const command = [
    `${MANIM_BIN} ${qualityFlag}`,
    "--format mp4",
    "--fps 24",
    "--resolution 1080,1920",
    `--media_dir ${shellPath(normalizeWslPath(mediaDir))}`,
    "--output_file scene.mp4",
    `${shellPath(normalizeWslPath(scriptPath))} GeometryProgramScene`,
  ].join(" ");
  return buildWslBashCommand(command);
}

export function buildManimRenderCommand(options: ManimRenderOptions): string[] {
  return [options.scriptPath, options.mediaDir, options.quality ?? "high"];
}

export async function renderManimScene(options: ManimRenderOptions): Promise<void> {
  // /mnt/c 对 Linux 的 atime/mtime 支持不完整，Manim 在合并临时帧时会因此失败。
  // 使用 WSL 原生 /tmp 渲染，完成后再把最终 MP4 复制回 Windows 输出目录。
  const scriptPath = path.resolve(options.scriptPath);
  const mediaDir = path.resolve(options.mediaDir);
  const safeName = path.basename(mediaDir).replace(/[^a-zA-Z0-9_-]/g, "-") || "scene";
  const nativeMediaDir = `/tmp/video-studio-manim/${safeName}-${process.pid}`;
  const [executable, ...args] = buildWslCommand(scriptPath, nativeMediaDir, options.quality ?? "high");
  await execFileAsync(executable, args, { windowsHide: true });
  const outputPath = normalizeWslPath(path.join(mediaDir, "scene.mp4"));
  const nativeOutput = `${nativeMediaDir}/videos/scene/1920p24/scene.mp4`;
  const copyCommand = `mkdir -p $(dirname '${outputPath}') && cp '${nativeOutput}' '${outputPath}' && rm -rf '${nativeMediaDir}'`;
  const [copyExecutable, ...copyArgs] = buildWslBashCommand(copyCommand);
  await execFileAsync(copyExecutable, copyArgs, { windowsHide: true });
}
