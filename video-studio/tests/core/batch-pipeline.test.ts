import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { adaptBriefDuration, compactBatchVideoTitle, executeBatchPipeline, pilotPlanRepairWarning, shouldRequestModelGeometry } from "../../src/batch-pipeline.js";
import type { VideoBrief } from "../../src/document/index.js";
import type { GeometryAction, GeometryObject } from "../../src/geometry/types.js";

const tempDirs: string[] = [];

it("非几何讲次不调用模型几何规划，函数和图形讲次保留动态规划", () => {
  expect(shouldRequestModelGeometry({ title: "实数运算", coreKnowledge: ["科学记数法"], example: undefined })).toBe(false);
  expect(shouldRequestModelGeometry({ title: "二次函数图像", coreKnowledge: ["顶点式"], example: undefined })).toBe(true);
});

it("简单知识点不强行拉到三分钟", () => {
  const brief: VideoBrief = {
    id: "simple-knowledge",
    title: "全等三角形判定",
    coreKnowledge: ["全等三角形判定"],
    targetDurationSeconds: 180,
    reviewFlags: [],
  };

  expect(adaptBriefDuration(brief).targetDurationSeconds).toBe(90);
});

it("keeps theorem-only knowledge videos short", () => {
  const brief: VideoBrief = {
    id: "theorem-knowledge",
    title: "theorem",
    coreKnowledge: ["theorem"],
    theorem: { statement: "SAS", conditions: ["two sides and included angle"], conclusion: "congruent" },
    targetDurationSeconds: 180,
    reviewFlags: [],
  };

  expect(adaptBriefDuration(brief).targetDurationSeconds).toBe(90);
});

it("专用几何例题使用短标题，避免顶部教案长串文字", () => {
  expect(compactBatchVideoTitle("正方形垂直等长例题：正方形中的全等、垂直与等腰三角形存在性"))
    .toBe("正方形垂直等长：证明FG∥CE且FG=CE");
});

it("专用模板审查提示准确区分动点和垂直等长例题", () => {
  expect(pilotPlanRepairWarning("perpendicular-equal")).toContain("正方形垂直等长");
  expect(pilotPlanRepairWarning("moving-point")).toContain("正方形动点");
});

it("全等三角形知识点不使用抽象占位图，而是生成判定演示", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-congruence-knowledge-test-"));
  tempDirs.push(root);
  const source = join(root, "lesson.txt");
  await writeFile(source, "全等三角形的判定：边角边。", "utf8");

  const result = await executeBatchPipeline({
    cwd: root,
    sourcePath: source,
    batchId: "congruence-knowledge",
    runRoot: join(root, "runs"),
    planner: {
      mapLesson: async () => ({
        id: "knowledge",
        title: "全等三角形知识点",
        coreKnowledge: ["全等三角形的判定"],
        theorems: [{ statement: "边角边判定", conditions: ["两边及其夹角分别相等"], conclusion: "两个三角形全等" }],
        examples: [],
      }),
      planTeaching: async () => { throw new Error("知识点应使用核验模板"); },
      planGeometry: async () => { throw new Error("知识点应使用核验几何模板"); },
    },
  });

  const videoRoot = join(root, "runs", "congruence-knowledge", "videos", result.videoIds[0]!);
  const teaching = JSON.parse(await readFile(join(videoRoot, "teaching-plan.json"), "utf8")) as { proof?: { statement?: string } };
  const geometry = JSON.parse(await readFile(join(videoRoot, "geometry-program.json"), "utf8")) as { objects: Array<{ id: string }>; actions: Array<{ type: string }> };

  expect(teaching.proof?.statement).toContain("边角边");
  expect(geometry.objects.map((object) => object.id)).toEqual(expect.arrayContaining(["triangle-abc", "triangle-def", "formula-congruent"]));
  expect(geometry.actions.map((action) => action.type)).toEqual(expect.arrayContaining(["fill", "transform-formula", "highlight"]));
});

it("妯″瀷杩斿洖绌哄姩鐢诲苟涓斾緥棰樹负鍗犱綅璇嶆椂锛岀敓鎴愮湡瀹炴棰樺拰鍙鍑犱綍鍔ㄧ敾", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-fallback-visual-test-"));
  tempDirs.push(root);
  const source = join(root, "lesson.txt");
  await writeFile(source, "【巩固练习】\n5. 在边长为1的正方形ABCD中，点E是射线BC上一动点，求证CG⊥CM。\n6. 下一道题。\n", "utf8");

  const result = await executeBatchPipeline({
    cwd: root,
    sourcePath: source,
    batchId: "fallback-visual",
    runRoot: join(root, "runs"),
    planner: {
      mapLesson: async () => ({
        id: "lesson-map",
        title: "巩固练习",
        coreKnowledge: ["全等三角形的判定与性质"],
        theorems: [],
        examples: [{
          id: "example-1",
          statement: "代表例题",
          keyClues: ["题干中的已知条件"],
          solutions: [{ name: "主解法", trigger: "题干信息", idea: "寻找全等三角形", steps: ["写出条件"], conclusion: "得到结论" }],
        }],
      }),
      planTeaching: async () => ({
        hook: "两块看似不同的三角形，为什么能证明它们完全一样？",
        intuition: ["先找不变的边和角"],
        proof: { statement: "全等三角形判定", conditions: ["边角条件"], construction: ["连接辅助线"], reasoningSteps: ["逐步对应"], conclusion: "两三角形全等" },
        solutions: [{ name: "主解法", trigger: "看到相等边角", idea: "寻找全等三角形", steps: ["对应边", "对应角"], conclusion: "得到结论" }],
        mistakes: ["不能漏写成立条件"],
        summary: "抓住不变量，再完成对应。",
      }),
      planGeometry: async () => ({
        canvas: { width: 1080, height: 1920, background: "dark" },
        objects: [],
        actions: [],
      }),
    },
  });

  const videoRoot = join(root, "runs", "fallback-visual", "videos", result.videoIds[0]!);
  const geometry = JSON.parse(await readFile(join(videoRoot, "geometry-program.json"), "utf8")) as { objects: unknown[]; actions: unknown[] };
  const storyboard = JSON.parse(await readFile(join(videoRoot, "storyboard.json"), "utf8")) as { scenes: Array<{ challenge?: { prompt?: string; details?: string } }> };
  const preview = await readFile(join(videoRoot, "preview", "index.html"), "utf8");

  expect(geometry.objects.length).toBeGreaterThan(3);
  expect(geometry.actions.length).toBeGreaterThan(3);
  expect(storyboard.scenes[0]?.challenge?.prompt).toContain("第5题");
  expect(storyboard.scenes[0]?.challenge?.details).toContain("正方形ABCD");
  expect(preview).toContain("question-details");
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("批量课程视频管线", () => {
  it("识别正方形动点例题并替换 MiMo 占位教学计划与通用几何图", async () => {
    const root = await mkdtemp(join(tmpdir(), "batch-square-point-test-"));
    tempDirs.push(root);
    const source = join(root, "lesson.txt");
    await writeFile(source, "武汉中考数学例题：正方形中的动点与全等三角形\n第5题：在边长为1的正方形ABCD中，点E是射线BC上一动点，AE与BD相交于M，AE与DC相交于F，G是EF的中点，连接CG。求证CG⊥CM，并讨论△MCE为等腰三角形的位置。", "utf8");

    const genericSolution = { name: "解法", trigger: "题干中的已知条件", idea: "根据题干条件建立关系", steps: ["写出条件并逐步推出结论"], conclusion: "得到题目所求结论" };
    const result = await executeBatchPipeline({
      cwd: root,
      sourcePath: source,
      batchId: "square-point",
      runRoot: join(root, "runs"),
      planner: {
        mapLesson: async () => ({
          id: "lesson-map",
          title: "正方形动点例题",
          coreKnowledge: ["全等三角形的判定与性质"],
          theorems: [],
          examples: [{
            id: "example-1",
            statement: "第5题：在边长为1的正方形ABCD中，点E是射线BC上一动点，AE与BD相交于M，AE与DC相交于F，G是EF的中点，连接CG。求证CG⊥CM，并讨论△MCE为等腰三角形的位置。",
            keyClues: ["正方形", "动点E", "G是EF的中点"],
            solutions: [genericSolution],
          }],
        }),
        planTeaching: async () => { throw new Error("pilot 不应调用通用教学规划"); },
        planGeometry: async () => ({ canvas: { width: 1080, height: 1920, background: "dark" }, objects: [], actions: [] }),
      },
    });

    const videoRoot = join(root, "runs", "square-point", "videos", result.videoIds[0]!);
    const teachingPlan = JSON.parse(await readFile(join(videoRoot, "teaching-plan.json"), "utf8")) as { proof?: { statement?: string }; solutions: Array<{ idea: string; trigger: string }>; };
    const geometry = JSON.parse(await readFile(join(videoRoot, "geometry-program.json"), "utf8")) as { objects: Array<{ id: string }>; actions: Array<{ type: string }> };
    const storyboard = JSON.parse(await readFile(join(videoRoot, "storyboard.json"), "utf8")) as { scenes: Array<{ narration?: string; challenge?: { prompt?: string } }> };
    const preview = await readFile(join(videoRoot, "preview/index.html"), "utf8");
    const report = JSON.parse(await readFile(join(videoRoot, "review/report.json"), "utf8")) as { warnings: string[] };

    expect(teachingPlan.proof?.statement).toContain("正方形");
    expect(teachingPlan.solutions[0]?.idea).toContain("坐标");
    expect(teachingPlan.solutions[1]?.trigger).toContain("等腰");
    expect(geometry.objects.map((object) => object.id)).toEqual(expect.arrayContaining(["square-abcd", "point-e", "segment-ae", "formula-mce"]));
    expect(geometry.actions.map((action) => action.type)).toEqual(expect.arrayContaining(["move-point", "transform-formula", "highlight"]));
    const formulaAnswer = geometry.objects.find((object) => object.id === "formula-answer") as { tex?: string; at?: { x: number; y: number } } | undefined;
    const formulaPerp = geometry.objects.find((object) => object.id === "formula-perp") as { at?: { x: number; y: number } } | undefined;
    const formulaMce = geometry.objects.find((object) => object.id === "formula-mce") as { at?: { x: number; y: number } } | undefined;
    const geometryDuration = geometry.actions.reduce((total, action) => total + (action as { duration?: number }).duration!, 0);
    const firstLabelDraw = geometry.actions.findIndex((action) => action.type === "draw" && (action as { objectId?: string }).objectId === "label-a");
    const formulaDraw = geometry.actions.findIndex((action) => action.type === "draw" && (action as { objectId?: string }).objectId === "formula-perp");
    expect(formulaAnswer?.tex).not.toContain("text{or}");
    expect(formulaAnswer?.at?.x).toBe(540);
    expect((formulaPerp?.at?.y ?? 0) - (formulaMce?.at?.y ?? 0)).toBeGreaterThan(90);
    expect((formulaAnswer?.at?.y ?? 0) - (formulaPerp?.at?.y ?? 0)).toBeGreaterThan(90);
    expect(geometryDuration).toBeGreaterThan(120);
    expect(firstLabelDraw).toBeGreaterThanOrEqual(0);
    expect(firstLabelDraw).toBeLessThan(formulaDraw);
    expect(preview).toContain("white-space: normal");
    expect(storyboard.scenes[0]?.challenge?.prompt).toBe("第5题");
    expect(storyboard.scenes.some((scene) => scene.narration?.includes("√3"))).toBe(true);
    expect(report.warnings.some((warning) => warning.startsWith("ALT_SOLUTION_UNAVAILABLE"))).toBe(false);
  });

  it("从教案文本生成批次清单、教学计划、GeometryProgram 和预览", async () => {
    const root = await mkdtemp(join(tmpdir(), "batch-pipeline-test-"));
    tempDirs.push(root);
    const source = join(root, "lesson.txt");
    await writeFile(source, "平行线的性质。已知两直线平行，求角度。", "utf8");

    const result = await executeBatchPipeline({
      cwd: root,
      sourcePath: source,
      batchId: "geometry-series",
      runRoot: join(root, "runs"),
      planner: {
        mapLesson: async () => ({
          id: "geometry",
          title: "平行线",
          coreKnowledge: ["parallel"],
          theorems: [],
          examples: [{
            id: "example-1",
            statement: "已知两直线平行，求角度。",
            keyClues: ["平行"],
            solutions: [{ name: "主解法", trigger: "看到平行", idea: "找同位角", steps: ["找角"], conclusion: "得到角度" }],
          }],
        }),
        planTeaching: async () => ({
          hook: "猜猜角度会怎样变化？",
          intuition: ["观察平行线"],
          solutions: [
            { name: "主解法", trigger: "看到平行", idea: "找同位角", steps: ["找角"], conclusion: "得到角度" },
            { name: "替代法", trigger: "看到三角形", idea: "用内角和", steps: ["补角"], conclusion: "得到角度" },
          ],
          mistakes: ["不要混淆同旁内角"],
          summary: "先找平行关系。",
        }),
        planGeometry: async () => ({
          canvas: { width: 1080, height: 1920, background: "paper" },
          objects: [{ id: "a", kind: "point", point: { x: 300, y: 600 } }],
          actions: [{ type: "draw", objectId: "a", duration: 1 }],
        }),
      },
    });

    expect(result.videoIds).toHaveLength(1);
    await expect(stat(join(root, "runs", "geometry-series", "manifest.json"))).resolves.toBeTruthy();
    const videoRoot = join(root, "runs", "geometry-series", "videos", result.videoIds[0]!);
    await expect(stat(join(videoRoot, "teaching-plan.json"))).resolves.toBeTruthy();
    await expect(stat(join(videoRoot, "geometry-program.json"))).resolves.toBeTruthy();
    await expect(stat(join(videoRoot, "manim", "scene.py"))).resolves.toBeTruthy();
    await expect(stat(join(videoRoot, "preview", "index.html"))).resolves.toBeTruthy();
    expect(JSON.parse(await readFile(join(root, "runs", "geometry-series", "manifest.json"), "utf8"))).toMatchObject({
      videoIds: result.videoIds,
    });
  });

  it("续跑时复用批次根目录的 LessonMap，不重复调用模型拆分", async () => {
    const root = await mkdtemp(join(tmpdir(), "batch-resume-test-"));
    tempDirs.push(root);
    const source = join(root, "lesson.txt");
    await writeFile(source, "几何知识点", "utf8");
    const planner = {
      mapLesson: async () => ({ id: "cached", title: "缓存课", coreKnowledge: ["平行线"], theorems: [], examples: [] }),
      planTeaching: async () => ({ hook: "先猜", intuition: ["观察"], solutions: [{ name: "主解法", trigger: "平行", idea: "找角", steps: ["推理"], conclusion: "得到结论" }], mistakes: ["别漏条件"], summary: "总结" }),
      planGeometry: async () => ({ canvas: { width: 1080 as const, height: 1920 as const, background: "paper" as const }, objects: [] as GeometryObject[], actions: [] as GeometryAction[] }),
    };
    await executeBatchPipeline({ cwd: root, sourcePath: source, batchId: "resume", runRoot: join(root, "runs"), planner });
    await expect(executeBatchPipeline({
      cwd: root,
      sourcePath: source,
      batchId: "resume",
      runRoot: join(root, "runs"),
      resume: true,
      planner: { ...planner, mapLesson: async () => { throw new Error("不应再次调用 mapLesson"); } },
    })).resolves.toMatchObject({ videoIds: ["cached-xian"] });
  });
});
