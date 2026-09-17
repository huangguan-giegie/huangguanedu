import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Lesson, RunDirectory } from "./types.js";
import { createStoryboard } from "./storyboard.js";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export async function createRunDirectory(runsRoot: string, id: string): Promise<RunDirectory> {
  if (!SAFE_ID.test(id)) throw new Error("非法 run id");
  const root = path.resolve(runsRoot, id);
  const paths = {
    root,
    lesson: path.join(root, "lesson.json"),
    storyboard: path.join(root, "storyboard.json"),
    audio: path.join(root, "audio"),
    preview: path.join(root, "preview"),
    render: path.join(root, "render"),
    review: path.join(root, "review"),
  };
  await mkdir(root, { recursive: true });
  await Promise.all([paths.audio, paths.preview, paths.render, paths.review].map((dir) => mkdir(dir, { recursive: true })));
  await Promise.all([
    writeFile(paths.lesson, "{}\n", { flag: "wx" }).catch(ignoreExisting),
    writeFile(paths.storyboard, "{}\n", { flag: "wx" }).catch(ignoreExisting),
  ]);
  return { id, paths };
}

function ignoreExisting(error: NodeJS.ErrnoException): void {
  if (error.code !== "EEXIST") throw error;
}

export async function writeLessonArtifacts(run: RunDirectory, lesson: Lesson): Promise<void> {
  await writeFile(run.paths.lesson, `${JSON.stringify(lesson, null, 2)}\n`);
  await writeFile(run.paths.storyboard, `${JSON.stringify(createStoryboard(lesson), null, 2)}\n`);
}
