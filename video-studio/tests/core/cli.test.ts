import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("CLI 参数", () => {
  it("解析命令、lesson、id 和 voice sample", () => {
    expect(parseCliArgs(["generate", "--lesson", "lessons/demo.yaml", "--id", "demo", "--voice-sample", "voice.wav"])).toEqual({
      command: "generate",
      lessonPath: "lessons/demo.yaml",
      id: "demo",
      voiceSamplePath: "voice.wav",
    });
  });

  it("支持全部命令名称", () => {
    expect(["generate", "preview", "render", "review", "make", "setup"].map((command) => parseCliArgs([command]).command)).toEqual([
      "generate", "preview", "render", "review", "make", "setup",
    ]);
  });

  it("解析目录级 source 和 batch id", () => {
    expect(parseCliArgs(["make", "--source", "templates", "--batch-id", "geometry-series", "--voice-sample", "voice.mp3"])).toEqual({
      command: "make",
      sourcePath: "templates",
      batchId: "geometry-series",
      voiceSamplePath: "voice.mp3",
    });
  });

  it("支持批次断点继续", () => {
    expect(parseCliArgs(["generate", "--source", "templates", "--batch-id", "geometry-series", "--resume"]).resume).toBe(true);
  });

  it("预览、渲染和审查命令允许只传 run id", () => {
    expect(parseCliArgs(["preview", "--id", "demo"]).id).toBe("demo");
    expect(parseCliArgs(["render", "--id", "demo"]).id).toBe("demo");
    expect(parseCliArgs(["review", "--id", "demo"]).id).toBe("demo");
  });

  it("generate 使用注入的规划器和配音器生成预览", async () => {
    const root = await mkdtemp(join(tmpdir(), "video-cli-test-"));
    await writeFile(join(root, "lesson.yaml"), "title: 测试\nquestion: 1 + 1 = ?\n", "utf8");
    const audioPath = join(root, "voice.wav");
    await writeFile(audioPath, "fake", "utf8");

    await expect(import("../../src/cli").then(({ runCli }) => runCli(
      ["generate", "--lesson", "lesson.yaml", "--id", "demo"],
      root,
      {
        planner: { plan: async () => ({ scenes: [{ id: "one", type: "summary", duration: 1, narration: "测试" }] }) },
        tts: { synthesizeVoiceClone: async () => ({ path: audioPath, cacheHit: false }) },
      },
    ))).resolves.toBeUndefined();
    await expect(stat(join(root, "runs", "demo", "preview", "index.html"))).resolves.toBeTruthy();
  });

  it("从根目录转发时兼容 video-studio/ 前缀路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "video-cli-prefix-"));
    const videoRoot = join(root, "video-studio");
    await mkdir(join(videoRoot, "lessons"), { recursive: true });
    await writeFile(join(videoRoot, "lessons", "demo.yaml"), "title: 测试\nquestion: 1 + 1 = ?\n", "utf8");

    await expect(import("../../src/cli").then(({ runCli }) => runCli(
      ["generate", "--lesson", "video-studio/lessons/demo.yaml", "--id", "demo"],
      videoRoot,
      { planner: { plan: async () => ({ scenes: [{ type: "summary", duration: 1, narration: "测试" }] }) } },
    ))).resolves.toBeUndefined();
    await expect(stat(join(videoRoot, "runs", "demo", "preview", "index.html"))).resolves.toBeTruthy();
  });

  it("从命令行脚本运行时会返回 MiMo 配置错误", async () => {
    const root = await mkdtemp(join(tmpdir(), "video-cli-entrypoint-"));
    await writeFile(join(root, "lesson.yaml"), "title: 测试\nquestion: 1 + 1 = ?\n", "utf8");
    await expect(execFileAsync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/cli.ts", "generate", "--lesson", join(root, "lesson.yaml")], {
      cwd: process.cwd(),
      env: { ...process.env, MIMO_API_KEY: "" },
    })).rejects.toMatchObject({ code: 1 });
  });
});
