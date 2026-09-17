import { readdir } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".doc", ".docx", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif",
  ".txt", ".md", ".markdown", ".yaml", ".yml", ".json",
]);

export interface BatchPaths {
  root: string;
  manifest: string;
  lessonMap: string;
  source: string;
  sourceText: string;
  pageImages: string;
  videos: string;
}

export interface ReadDirectory {
  (directory: string): Promise<string[]>;
}

function normalizePath(value: string): string {
  return path.normalize(value).replaceAll("/", path.sep);
}

export async function discoverSourceFiles(
  sourcePath: string,
  readDirectory: ReadDirectory = async (directory) => (await readdir(directory)).map((name) => path.join(directory, name)),
): Promise<string[]> {
  const entries = await readDirectory(sourcePath);
  return entries
    .filter((entry) => SOURCE_EXTENSIONS.has(path.extname(entry).toLowerCase()))
    .map(normalizePath)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function createBatchPaths(runsRoot: string, batchId: string): BatchPaths {
  if (!/^[a-zA-Z0-9_-]+$/.test(batchId)) throw new Error("批次 ID 只能包含字母、数字、下划线和短横线");
  const root = path.resolve(runsRoot, batchId);
  const source = path.join(root, "source");
  return {
    root,
    manifest: path.join(root, "manifest.json"),
    lessonMap: path.join(root, "lesson-map.json"),
    source,
    sourceText: path.join(source, "extracted-text.json"),
    pageImages: path.join(source, "page-images"),
    videos: path.join(root, "videos"),
  };
}
