import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
import { createRunDirectory } from "../../src/core/run";

describe("run 目录", () => {
  it("创建 lesson.json、storyboard.json、audio、preview、render、review", async () => {
    const root = await mkdtemp(join(tmpdir(), "video-studio-test-"));
    tempDirs.push(root);
    const run = await createRunDirectory(root, "lesson-001");

    expect(run.id).toBe("lesson-001");
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.lesson))).resolves.toBeTruthy();
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.storyboard))).resolves.toBeTruthy();
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.audio))).resolves.toBeTruthy();
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.preview))).resolves.toBeTruthy();
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.render))).resolves.toBeTruthy();
    await expect(import("node:fs/promises").then((fs) => fs.stat(run.paths.review))).resolves.toBeTruthy();
  });

  it("拒绝穿越 runs 根目录的 id", async () => {
    await expect(createRunDirectory("C:/tmp/video-studio", "../escape")).rejects.toThrow("非法 run id");
  });
});
