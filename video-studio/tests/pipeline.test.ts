import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { compactStoryboardNarration, deduplicateStoryboardNarration, executeVideoPipeline, normalizePlannerStoryboard } from "../src/pipeline.js";

describe("视频生产线编排", () => {
  it("为缺少采样点的函数曲线补充可渲染的抛物线", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{ id: "curve", type: "function-curve", start: 0, duration: 2, narration: "画出抛物线", points: [{ x: 2, y: -1 }] }],
    }, { title: "二次函数" }, "curve-demo");

    expect(storyboard.scenes[0].points).toHaveLength(5);
    expect(storyboard.scenes[0].points?.[2]).toEqual({ x: 420, y: 400 });
  });

  it("为参数变化场景补充连续曲线，避免只渲染一个孤立点", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{ id: "sweep", type: "parameter-sweep", start: 0, duration: 2, narration: "观察参数变化" }],
    }, { title: "二次函数" }, "sweep-demo");

    expect(storyboard.scenes[0].points).toHaveLength(5);
  });

  it("把 MiMo 的数学坐标映射到可见的 SVG 绘图区", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{
        id: "curve",
        type: "function-curve",
        duration: 20,
        narration: "观察抛物线",
        points: [{ x: 0, y: 3 }, { x: 2, y: -1 }, { x: 4, y: 3 }],
      }],
    }, { title: "二次函数" }, "mapped-curve");

    expect(storyboard.scenes[0].points).toEqual([
      { x: 120, y: 160 },
      { x: 440, y: 400 },
      { x: 760, y: 160 },
    ]);
  });

  it("规范化 MiMo 分镜时也压紧场景起点，预览阶段不产生黑屏空档", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [
        { id: "one", type: "summary", start: 0, duration: 2, narration: "第一段" },
        { id: "two", type: "summary", start: 20, duration: 3, narration: "第二段" },
      ],
    }, { title: "二次函数" }, "gapless-demo");

    expect(storyboard.scenes.map((scene) => scene.start)).toEqual([0, 2]);
  });

  it("把挑战题与参数变化分镜以及 lesson 文案贯通到渲染模型", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [
        { id: "hook", type: "challenge", start: 0, duration: 10, narration: "猜一猜", challenge: { badge: "先猜 3 秒", prompt: "最低点在哪里？", options: ["0", "-1", "3"] } },
        { id: "sweep", type: "parameter-sweep", start: 10, duration: 20, narration: "观察参数变化" },
      ],
    }, { title: "二次函数", hook: "先猜一猜", cta: "欢迎参加课程" }, "hook-demo");

    expect(storyboard.scenes.map((scene) => scene.type)).toEqual(["challenge", "parameter-sweep"]);
    expect(storyboard.scenes[0].challenge?.options).toEqual(["0", "-1", "3"]);
    expect(storyboard.scenes[1].narration).toContain("欢迎参加课程");
  });

  it("保留 MiMo 返回的公式化简步骤", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{
        id: "derive",
        type: "equation-transform",
        start: 0,
        duration: 24,
        narration: "一步一步完成配方",
        steps: ["y = x² - 4x + 3", "= (x - 2)² - 1"],
      }],
    }, { title: "二次函数" }, "derive-demo");

    expect(storyboard.scenes[0].equationSteps).toEqual(["y = x² - 4x + 3", "= (x - 2)² - 1"]);
  });

  it("当 MiMo 没有返回步骤时使用 lesson 中的公式链兜底", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{ id: "derive", type: "equation-transform", duration: 20, narration: "完成配方" }],
    }, { title: "二次函数", equationSteps: ["原式", "变形", "结论"] }, "derive-fallback");

    expect(storyboard.scenes[0].equationSteps).toEqual(["原式", "变形", "结论"]);
  });

  it("当 MiMo 公式步骤不完整时优先使用 lesson 的完整推导链", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: [{ id: "derive", type: "equation-transform", duration: 20, narration: "完成配方", steps: ["原式", "变形", "结论"] }],
    }, { title: "二次函数", equationSteps: ["原式", "变形", "顶点式", "平方项非负", "最小值"] }, "derive-complete");

    expect(storyboard.scenes[0].equationSteps).toEqual(["原式", "变形", "顶点式", "平方项非负", "最小值"]);
  });

  it("在配音前按目标字数压缩过长旁白，同时保留所有场景", () => {
    const storyboard = normalizePlannerStoryboard({
      scenes: Array.from({ length: 5 }, (_, index) => ({
        id: `scene-${index + 1}`,
        type: "summary",
        duration: 30,
        narration: Array.from({ length: 8 }, (_, round) => `第${index + 1}个场景第${round + 1}轮：第一句解释原理。第${index + 1}个场景第${round + 1}轮：第二句补充一个关键细节。第${index + 1}个场景第${round + 1}轮：第三句说明如何用于中考题。第${index + 1}个场景第${round + 1}轮：第四句回收方法。`).join(""),
      })),
    }, { title: "二次函数" }, "compact-demo");

    const compacted = compactStoryboardNarration(storyboard, 165);
    const totalCharacters = compacted.scenes.reduce((sum, scene) => sum + Array.from(scene.narration ?? "").length, 0);

    expect(compacted.scenes).toHaveLength(5);
    expect(totalCharacters).toBeGreaterThanOrEqual(600);
    expect(totalCharacters).toBeLessThanOrEqual(Math.round(165 * 5));
    expect(compacted.scenes.every((scene) => scene.narration)).toBe(true);
  });

  it("删除跨场景完全重复的旁白句子", () => {
    const repeated = "几何综合题往往结合了动点、旋转、翻折等变换，让人眼花缭乱。";
    const result = deduplicateStoryboardNarration({
      id: "dedupe",
      title: "几何",
      scenes: [
        { id: "one", type: "summary", start: 0, duration: 4, narration: `先看图。${repeated}` },
        { id: "two", type: "summary", start: 4, duration: 4, narration: `${repeated}再看不变量。` },
      ],
    });

    expect(result.scenes[0].narration).toContain(repeated);
    expect(result.scenes[1].narration).toBe("再看不变量。");
  });

  it("删除同一场景中被模型连续重复的完整句子", () => {
    const repeated = "几何综合题往往结合了动点、旋转、翻折等变换，让人眼花缭乱。";
    const result = deduplicateStoryboardNarration({
      id: "same-scene-dedupe",
      title: "几何综合题",
      scenes: [{
        id: "one",
        type: "summary",
        start: 0,
        duration: 8,
        narration: `先看一个现象。${repeated}${repeated}核心是不变量。`,
      }],
    });

    expect(result.scenes[0].narration).toBe(`先看一个现象。${repeated}核心是不变量。`);
  });

  it("把 MiMo 分镜和配音写入 run，并生成 HyperFrames 预览与审查报告", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "video-pipeline-test-"));
    const lessonPath = join(tempRoot, "lesson.yaml");
    await (await import("node:fs/promises")).writeFile(
      lessonPath,
      [
        "title: 二次函数图像与最值",
        "topic: 二次函数",
        "question: 求 y = x^2 - 4x + 3 的最小值",
        "answer: 最小值为 -1",
      ].join("\n"),
      "utf8",
    );

    const audioPath = join(tempRoot, "scene-1.wav");
    await (await import("node:fs/promises")).writeFile(audioPath, Buffer.from("fake-wav"));
    const voiceSamplePath = join(tempRoot, "voice.wav");
    await (await import("node:fs/promises")).writeFile(voiceSamplePath, Buffer.from("fake-voice"));
    let receivedSamplePath = "";

    const result = await executeVideoPipeline({
      cwd: tempRoot,
      lessonPath,
      id: "quadratic-extremum",
      voiceSamplePath: "voice.wav",
      planner: {
        async plan() {
          return {
            scenes: [
              {
                id: "intro",
                type: "summary",
                start: 0,
                duration: 2,
                subtitle: "先看抛物线的顶点",
                formula: "y = (x - 2)^2 - 1",
                narration: "我们先把式子配方。",
              },
            ],
          };
        },
      },
      tts: {
        async synthesizeVoiceClone(request) {
          receivedSamplePath = request.samplePath;
          return { path: audioPath, cacheHit: false };
        },
      },
    });

    expect(result.run.id).toBe("quadratic-extremum");
    expect(isAbsolute(receivedSamplePath)).toBe(true);
    await expect(stat(join(result.run.paths.preview, "index.html"))).resolves.toBeTruthy();
    await expect(stat(join(result.run.paths.preview, "audio", "1-intro.wav"))).resolves.toBeTruthy();
    await expect(stat(join(result.run.paths.review, "report.json"))).resolves.toBeTruthy();
    await expect(readFile(result.run.paths.storyboard, "utf8")).resolves.toContain('"src": "audio/1-intro.wav"');
  });

  it("用真实配音时长压紧场景时间轴，避免空档黑屏", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "video-pipeline-gap-test-"));
    const lessonPath = join(tempRoot, "lesson.yaml");
    await (await import("node:fs/promises")).writeFile(lessonPath, "title: 二次函数\nquestion: 求最小值\n", "utf8");
    const audioPath = join(tempRoot, "scene.wav");
    const voicePath = join(tempRoot, "voice.wav");
    await (await import("node:fs/promises")).writeFile(audioPath, Buffer.from("fake-wav"));
    await (await import("node:fs/promises")).writeFile(voicePath, Buffer.from("fake-voice"));

    const result = await executeVideoPipeline({
      cwd: tempRoot,
      lessonPath,
      voiceSamplePath: voicePath,
      planner: {
        async plan() {
          return { scenes: [
            { id: "one", type: "summary", start: 0, duration: 2, narration: "第一段" },
            { id: "two", type: "summary", start: 20, duration: 3, narration: "第二段" },
          ] };
        },
      },
      tts: { async synthesizeVoiceClone() { return { path: audioPath, cacheHit: false }; } },
    });

    expect(result.storyboard.scenes.map((scene) => scene.start)).toEqual([0, 2]);
    expect(result.storyboard.scenes[1].audio?.start).toBe(2);
  });
});
