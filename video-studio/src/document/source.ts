import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { DocumentKind, DocumentPage, DocumentSource } from "./types.js";
import type { DocumentAsset } from "./types.js";
import { normalizeWslPath } from "../infrastructure/wsl.js";

const execFileAsync = promisify(execFile);
const textExtensions = new Set([".txt", ".md", ".markdown", ".yaml", ".yml", ".json"]);
const imageMimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface SourceScanOptions {
  listFiles?: (directory: string) => Promise<string[]>;
}

export interface DocumentReadOptions {
  readFile?: (filePath: string) => Promise<string | Uint8Array>;
  commandRunner?: CommandRunner;
  platform?: NodeJS.Platform;
  pageImageDir?: string;
  wslAvailable?: boolean;
}

function extensionOf(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function identifyDocumentKind(filePath: string): DocumentKind | null {
  const extension = extensionOf(filePath);
  if (textExtensions.has(extension)) return "text";
  if (imageMimeTypes[extension]) return "image";
  if (extension === ".doc") return "doc";
  if (extension === ".docx") return "docx";
  if (extension === ".pdf") return "pdf";
  return null;
}

function defaultReadFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

function defaultCommandRunner(command: string, args: string[]) {
  return execFileAsync(command, args, { maxBuffer: 50 * 1024 * 1024 }).then((result) => ({
    exitCode: 0,
    stdout: result.stdout,
    stderr: result.stderr,
  }));
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function temporaryDocumentDir(filePath: string, suffix: string): string {
  const hash = createHash("sha1").update(filePath).digest("hex").slice(0, 12);
  return `/tmp/video-studio-doc-${suffix}-${hash}`;
}

function conversionCommand(kind: "doc" | "docx" | "pdf", filePath: string, platform: NodeJS.Platform): [string, string[]] {
  const inputPath = platform === "win32" ? normalizeWslPath(filePath) : filePath;
  const quoted = quoteShell(inputPath);
  const script = kind === "pdf"
    ? `pdftotext -layout ${quoted} -`
    : (() => {
      const tempDir = temporaryDocumentDir(filePath, "text");
      const profileDir = `${tempDir}/profile`;
      return `rm -rf ${quoteShell(tempDir)} && mkdir -p ${quoteShell(profileDir)} && libreoffice --headless -env:UserInstallation=file://${profileDir} --convert-to txt:Text --outdir ${quoteShell(tempDir)} ${quoted} >/dev/null && cat ${quoteShell(tempDir)}/*.txt && rm -rf ${quoteShell(tempDir)}`;
    })();
  return platform === "win32" ? ["wsl", ["--", "bash", "-lc", script]] : ["sh", ["-lc", script]];
}

function safeShellName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function pageImageCommand(kind: "doc" | "docx" | "pdf", filePath: string, pageImageDir: string, platform: NodeJS.Platform): [string, string[]] {
  const inputPath = platform === "win32" ? normalizeWslPath(filePath) : filePath;
  const outputDir = platform === "win32" ? normalizeWslPath(pageImageDir) : pageImageDir;
  const prefix = `${outputDir}/${safeShellName(path.basename(filePath, path.extname(filePath)))}-page`;
  const quotedInput = quoteShell(inputPath);
  const quotedOutputDir = quoteShell(outputDir);
  const quotedPrefix = quoteShell(prefix);
  const script = kind === "pdf"
    ? `mkdir -p ${quotedOutputDir} && pdftoppm -png -r 120 ${quotedInput} ${quotedPrefix}`
    : (() => {
      const tempDir = temporaryDocumentDir(filePath, "pdf");
      const pdfPath = `${tempDir}/${path.basename(filePath, path.extname(filePath))}.pdf`;
      return `rm -rf ${quoteShell(tempDir)} && mkdir -p ${quoteShell(`${tempDir}/profile`)} ${quotedOutputDir} && libreoffice --headless -env:UserInstallation=file://${tempDir}/profile --convert-to pdf --outdir ${quoteShell(tempDir)} ${quotedInput} >/dev/null && pdftoppm -png -r 120 ${quoteShell(pdfPath)} ${quotedPrefix} >/dev/null && rm -rf ${quoteShell(tempDir)}`;
    })();
  return platform === "win32" ? ["wsl", ["--", "bash", "-lc", script]] : ["sh", ["-lc", script]];
}

function actionableWindowsError(): Error {
  return new Error("当前 Windows 未检测到可用 WSL，无法读取此文档。请先安装并启动 WSL2 Ubuntu，或传入可用的 commandRunner。建议执行：wsl --install -d Ubuntu-24.04");
}

function asText(value: string | Uint8Array): string {
  return typeof value === "string" ? value : Buffer.from(value).toString("utf8");
}

function imageAsset(filePath: string, data: string | Uint8Array): DocumentAsset {
  const mimeType = imageMimeTypes[extensionOf(filePath)] ?? "application/octet-stream";
  const bytes = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  return { kind: "image", path: filePath, mimeType, dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}` };
}

function textPages(text: string): DocumentPage[] {
  const pages = text.split("\f");
  while (pages.length > 1 && !pages.at(-1)?.trim()) pages.pop();
  return pages.map((pageText, index) => ({ pageNumber: index + 1, text: pageText, assets: [] }));
}

async function loadPageImages(source: DocumentSource, pageImageDir: string): Promise<DocumentAsset[]> {
  const base = safeShellName(path.basename(source.path, source.extension));
  const names = await fs.readdir(pageImageDir).catch(() => [] as string[]);
  return names
    .filter((name) => name.startsWith(`${base}-page-`) && name.toLowerCase().endsWith(".png"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .map((name) => ({ kind: "image" as const, path: path.join(pageImageDir, name), mimeType: "image/png" }));
}

export function createDocumentSource(filePath: string): DocumentSource {
  const kind = identifyDocumentKind(filePath);
  if (!kind) throw new Error(`不支持的文档格式：${filePath}`);
  const extension = extensionOf(filePath);
  return { id: path.basename(filePath, extension), path: filePath, extension, kind, pages: [], assets: [] };
}

export async function readDocumentSource(filePath: string, options: DocumentReadOptions = {}): Promise<DocumentSource> {
  const source = createDocumentSource(filePath);
  const readFile = options.readFile ?? defaultReadFile;
  if (source.kind === "image") {
    const asset = imageAsset(filePath, await readFile(filePath));
    const page: DocumentPage = { pageNumber: 1, text: "", assets: [asset] };
    return { ...source, pages: [page], assets: [asset] };
  }

  let text: string;
  if (source.kind === "text") {
    text = asText(await readFile(filePath));
  } else {
    const platform = options.platform ?? process.platform;
    if (!options.commandRunner && platform === "win32") {
      if (options.wslAvailable === false) throw actionableWindowsError();
      try {
        const wslStatus = await defaultCommandRunner("wsl", ["--status"]);
        if (wslStatus.exitCode !== 0) throw actionableWindowsError();
      } catch {
        throw actionableWindowsError();
      }
    }
    const runner = options.commandRunner ?? defaultCommandRunner;
    const [command, args] = conversionCommand(source.kind, filePath, platform);
    const result = await runner(command, args);
    if (result.exitCode !== 0) throw new Error(`文档转换失败：${result.stderr || "转换工具返回错误"}`);
    text = result.stdout;
  }
  let pages = textPages(text);
  let assets: DocumentAsset[] = [];
  if (options.pageImageDir && source.kind !== "text") {
    const pageImageDir = path.resolve(options.pageImageDir);
    await fs.mkdir(pageImageDir, { recursive: true });
    try {
      const runner = options.commandRunner ?? defaultCommandRunner;
      const [command, args] = pageImageCommand(source.kind, filePath, pageImageDir, options.platform ?? process.platform);
      const result = await runner(command, args);
      if (result.exitCode === 0) {
        assets = await loadPageImages(source, pageImageDir);
        if (assets.length) {
          pages = assets.map((asset, index) => ({ pageNumber: index + 1, text: pages[index]?.text ?? (index === 0 ? text : ""), assets: [asset] }));
        }
      }
    } catch {
      // 页面图像是增强理解的非阻断资产；文字提取成功时仍继续生成。
    }
  }
  return { ...source, pages, assets };
}

async function defaultListFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? defaultListFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}

export async function scanDocumentSources(directory: string, options: SourceScanOptions = {}): Promise<DocumentSource[]> {
  const files = await (options.listFiles ?? defaultListFiles)(directory);
  return files
    .filter((filePath) => identifyDocumentKind(filePath) !== null)
    .sort((a, b) => a.localeCompare(b))
    .map(createDocumentSource);
}

export type { DocumentAsset, DocumentKind, DocumentPage, DocumentSource } from "./types.js";
