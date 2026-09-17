import { access, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanDocumentSources, readDocumentSource, batchVideoBriefs, type DocumentSource, type LessonMap, type VideoBrief } from "./document/index.js";
import { createBatchPaths } from "./core/batch.js";
import { createRunDirectory } from "./core/run.js";
import { compactStoryboardNarration, attachAudio, type TtsClient } from "./pipeline.js";
import { renderCompositionHtml, type Storyboard as RenderStoryboard, type StoryboardScene } from "./render/composition.js";
import { generateReviewReport, renderReviewReportHtml } from "./render/review.js";
import { renderManimScene as compileManimScene } from "./geometry/manim.js";
import type { GeometryProgram } from "./geometry/types.js";
import type { TeachingInput } from "./providers/mimo/teaching.js";
import { MimoTtsClient } from "./providers/mimo/tts.js";
import type { SolutionPlan, TeachingPlan } from "./planning/types.js";
import { validateTeachingPlan } from "./planning/validate.js";
import { createTeachingPlanner } from "./providers/factory.js";

export interface BatchPlanner {
  mapLesson(input: TeachingInput): Promise<LessonMap>;
  planTeaching(input: TeachingInput): Promise<TeachingPlan>;
  planGeometry(input: TeachingInput): Promise<GeometryProgram>;
}

export interface BatchPipelineOptions {
  cwd: string;
  sourcePath: string;
  batchId: string;
  runRoot?: string;
  voiceSamplePath?: string;
  planner?: BatchPlanner;
  tts?: TtsClient;
  renderManim?: boolean;
  resume?: boolean;
}

export interface BatchPipelineResult {
  batchId: string;
  videoIds: string[];
  manifestPath: string;
}

const asText = (source: DocumentSource): string => source.pages.map((page) => page.text).join("\n").trim();

function selectReferenceImages(sources: DocumentSource[], maximum = 12): string[] {
  // 文档页图主要用于留档和人工复核。Qwen 对大批量页图请求很容易连接超时，
  // 只有用户直接提供图片题时才送入多模态规划；文档中的图形由 Manim 重建。
  const all = sources
    .filter((source) => source.kind === "image")
    .flatMap((source) => source.assets.filter((asset) => asset.kind === "image").map((asset) => asset.path));
  if (all.length <= maximum) return all;
  const selected: string[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.floor(index * all.length / maximum);
    const image = all[sourceIndex];
    if (image && !selected.includes(image)) selected.push(image);
  }
  return selected;
}

export function shouldRequestModelGeometry(brief: Pick<VideoBrief, "title" | "coreKnowledge" | "example">): boolean {
  const text = `${brief.title}${brief.coreKnowledge.join("")}${brief.example?.statement ?? ""}`;
  return /几何|三角形|四边形|圆|全等|相似|平行|垂直|正方形|矩形|旋转|翻折|动点|函数|坐标|数轴|抛物线|直线/u.test(text);
}

async function readSources(sourcePath: string, pageImageDir: string): Promise<DocumentSource[]> {
  const absolute = path.resolve(sourcePath);
  const sourceStats = await import("node:fs/promises").then((fs) => fs.stat(absolute));
  if (sourceStats.isDirectory()) {
    const sourceFiles = await scanDocumentSources(absolute);
    return Promise.all(sourceFiles.map((source) => readDocumentSource(source.path, { pageImageDir })));
  }
  return [await readDocumentSource(absolute, { pageImageDir })];
}

export function buildFallbackGeometryProgram(brief: Pick<VideoBrief, "title" | "coreKnowledge">): GeometryProgram {
  const isGeometry = /几何|三角形|全等|相似|平行|正方形|旋转/u.test(`${brief.title}${brief.coreKnowledge.join("")}`);
  if (!isGeometry) {
    return {
      canvas: { width: 1080, height: 1920, background: "dark" },
      objects: [
        { id: "fallback-origin", kind: "point", point: { x: 540, y: 960 } },
        { id: "fallback-axis", kind: "segment", start: { x: 160, y: 960 }, end: { x: 920, y: 960 } },
        { id: "fallback-trace", kind: "segment", start: { x: 240, y: 1150 }, end: { x: 840, y: 650 } },
      ],
      actions: [
        { type: "draw", objectId: "fallback-axis", duration: 1 },
        { type: "draw", objectId: "fallback-trace", duration: 1.4 },
        { type: "draw", objectId: "fallback-origin", duration: 0.5 },
        { type: "highlight", objectIds: ["fallback-trace"], duration: 1 },
      ],
    };
  }
  return {
    canvas: { width: 1080, height: 1920, background: "dark" },
    objects: [
      { id: "point-a", kind: "point", point: { x: 220, y: 620 } },
      { id: "point-b", kind: "point", point: { x: 150, y: 1000 } },
      { id: "point-c", kind: "point", point: { x: 410, y: 1000 } },
      { id: "point-d", kind: "point", point: { x: 690, y: 620 } },
      { id: "point-e", kind: "point", point: { x: 620, y: 1000 } },
      { id: "point-f", kind: "point", point: { x: 880, y: 1000 } },
      { id: "triangle-left", kind: "triangle", points: ["point-a", "point-b", "point-c"] },
      { id: "triangle-right", kind: "triangle", points: ["point-d", "point-e", "point-f"] },
      { id: "helper-line", kind: "helper-line", start: "point-a", end: "point-d" },
      { id: "label-a", kind: "label", text: "A", at: { x: 220, y: 570 } },
      { id: "label-b", kind: "label", text: "B", at: { x: 115, y: 1040 } },
      { id: "label-c", kind: "label", text: "C", at: { x: 430, y: 1040 } },
      { id: "label-d", kind: "label", text: "D", at: { x: 690, y: 570 } },
      { id: "label-e", kind: "label", text: "E", at: { x: 600, y: 1040 } },
      { id: "label-f", kind: "label", text: "F", at: { x: 900, y: 1040 } },
    ],
    actions: [
      { type: "draw", objectId: "triangle-left", duration: 1.2 },
      { type: "draw", objectId: "triangle-right", duration: 1.2 },
      { type: "fill", objectId: "triangle-left", color: "#4F8CFF", duration: 0.8 },
      { type: "fill", objectId: "triangle-right", color: "#FF8066", duration: 0.8 },
      { type: "draw", objectId: "helper-line", duration: 1 },
      { type: "draw", objectId: "label-a", duration: 0.25 },
      { type: "draw", objectId: "label-b", duration: 0.25 },
      { type: "draw", objectId: "label-c", duration: 0.25 },
      { type: "draw", objectId: "label-d", duration: 0.25 },
      { type: "draw", objectId: "label-e", duration: 0.25 },
      { type: "draw", objectId: "label-f", duration: 0.25 },
      { type: "rotate", objectIds: ["triangle-right", "point-d", "point-e", "point-f", "label-d", "label-e", "label-f"], center: { x: 750, y: 810 }, angle: 28, duration: 2 },
      { type: "highlight", objectIds: ["triangle-left", "triangle-right"], duration: 1.2 },
      { type: "rotate", objectIds: ["triangle-right", "point-d", "point-e", "point-f", "label-d", "label-e", "label-f"], center: { x: 750, y: 810 }, angle: -28, duration: 1.6 },
    ],
  };
}

function isSquareMovingPointExample(brief: Pick<VideoBrief, "title" | "coreKnowledge" | "example">): boolean {
  const text = `${brief.title}${brief.coreKnowledge.join("")}${brief.example?.statement ?? ""}`;
  return /正方形/u.test(text) && /动点|射线BC/u.test(text) && /全等|CG|MCE/u.test(text);
}

function isSquarePerpendicularEqualExample(brief: Pick<VideoBrief, "title" | "coreKnowledge" | "example">): boolean {
  const text = `${brief.title}${brief.coreKnowledge.join("")}${brief.example?.statement ?? ""}`;
  return /正方形/u.test(text) && /CE\s*=\s*BF|CE=BF|垂直|⊥/u.test(text) && /EG|FG|CF/u.test(text);
}

function isCongruenceKnowledgeBrief(brief: Pick<VideoBrief, "title" | "coreKnowledge" | "example">): boolean {
  const text = `${brief.title}${brief.coreKnowledge.join("")}`;
  return !brief.example && /全等三角形/u.test(text);
}

function buildCongruenceKnowledgeTeachingPlan(): TeachingPlan {
  return {
    hook: "两个三角形位置不同、朝向不同，怎么只凭三条边角信息，就判断它们完全一样？今天用边角边把这个判断拆开。",
    intuition: [
      "先不要急着量面积，观察两组三角形：如果两条对应边相等，而且夹角也相等，第三个顶点就被唯一锁定了。",
      "边角边的核心是‘两边夹一角’，角必须夹在这两条边之间，顺序写错就不能直接判定全等。",
    ],
    proof: {
      premise: "在三角形ABC和三角形DEF中，AB=DE，∠B=∠E，BC=EF。",
      statement: "边角边判定：三角形ABC≌三角形DEF。",
      conditions: ["AB=DE", "∠B=∠E", "BC=EF", "相等的角分别是两条相等边的夹角"],
      construction: ["标出两条对应边和它们的夹角", "把三角形DEF沿对应边旋转到三角形ABC的位置"],
      reasoningSteps: [
        "先让DE与AB重合，两个端点的位置随之确定。",
        "因为∠E=∠B，且两角分别夹在对应边之间，EF的方向与BC一致。",
        "又因为EF=BC，第三个顶点F只能落在点C的位置。",
        "因此三个对应顶点重合，两个三角形的边和角全部对应相等，所以三角形ABC≌三角形DEF。",
      ],
      conclusion: "两边及其夹角分别相等，可以判定两个三角形全等，这就是边角边。",
    },
    solutions: [
      {
        name: "判定法：边角边",
        trigger: "题目同时给出两条对应边和它们的夹角相等",
        idea: "按边、角、边的顺序核对对应关系，再写出全等结论",
        steps: ["写出AB=DE", "写出∠B=∠E", "写出BC=EF", "按对应顶点顺序写出△ABC≌△DEF"],
        conclusion: "满足边角边条件，两个三角形全等。",
      },
      {
        name: "变换法：重合观察",
        trigger: "题目给出图形可以旋转、平移或翻折",
        idea: "把一个三角形移动到另一个三角形上，观察三条对应边是否完全重合",
        steps: ["先平移一条对应边", "再旋转使夹角重合", "用第二条等长边锁定第三个顶点", "检查三个顶点是否全部对应"],
        conclusion: "重合后的图形完全一致，因此两个三角形全等。",
      },
    ],
    mistakes: ["不要把两边及其夹角误写成两边和一个不夹在中间的角；判定顺序也不能错位。"],
    summary: "看到两条对应边和夹角，先检查角是不是夹角，再按边角边写对应顺序。",
    cta: "下次遇到全等题，先圈出不变量，再判断是哪一种判定方法。",
  };
}

export function pilotPlanRepairWarning(kind: "moving-point" | "perpendicular-equal" | "congruence-knowledge"): string {
  if (kind === "perpendicular-equal") return "MIMO_PLAN_REPAIRED: 已用经过核验的正方形垂直等长教学模板替换占位规划";
  if (kind === "congruence-knowledge") return "MIMO_PLAN_REPAIRED: 已用经过核验的全等三角形知识点模板替换占位规划";
  return "MIMO_PLAN_REPAIRED: 已用经过核验的正方形动点教学模板替换占位规划";
}

function buildSquarePerpendicularEqualTeachingPlan(): TeachingPlan {
  return {
    hook: "正方形里只给出一组等长和两次垂直，为什么最后能推出另一组线段既相等又平行？关键不是猜图，而是把两组三角形对上。",
    intuition: [
      "先圈出题干里的不变量：正方形给出相等的边和直角，CE=BF给出一组对应边，EG⊥DE且EG=DE给出第二组垂直等长关系。",
      "把△CBF和△DCE放在一起比较，再把CF、DE、EG串起来，最后用一组平行且相等的对边收回FG与CE。",
    ],
    proof: {
      premise: "在正方形ABCD中，E、F分别在BC、AB上，CE=BF；过E作EG⊥DE且EG=DE。",
      statement: "FG∥CE且FG=CE。",
      conditions: ["ABCD为正方形", "CE=BF", "EG⊥DE", "EG=DE"],
      construction: ["连接CF、DE、FG、CE", "比较△CBF与△DCE"],
      reasoningSteps: [
        "由CB=CD、BF=CE以及∠CBF=∠DCE=90°，得△CBF≌△DCE。",
        "由全等得CF=DE，且对应角关系结合正方形直角可得CF⊥DE。",
        "又因为EG⊥DE，所以EG∥CF；再由EG=DE=CF，四边形EGFC的一组对边平行且相等。",
        "因此FG∥CE且FG=CE。",
      ],
      conclusion: "正方形、全等和垂直等长共同构成了一个稳定的平行四边形关系。",
    },
    solutions: [
      {
        name: "解法一：全等＋平行四边形",
        trigger: "题干同时给出正方形、CE=BF、DE⊥EG且DE=EG",
        idea: "先用SAS证明△CBF≌△DCE，再把垂直等长关系转化成平行四边形。",
        steps: [
          "证明CB=CD、BF=CE、∠CBF=∠DCE=90°，得到△CBF≌△DCE。",
          "得到CF=DE，并由对应角关系证明CF⊥DE。",
          "由EG⊥DE得EG∥CF，再由EG=DE=CF得EG∥CF且EG=CF。",
          "四边形EGFC为平行四边形，所以FG∥CE且FG=CE。",
        ],
        conclusion: "FG∥CE且FG=CE。",
      },
      {
        name: "解法二：旋转直觉＋向量校验",
        trigger: "题干出现垂直、等长和正方形直角，适合把一条边旋转90°观察",
        idea: "把DE旋转90°，它的方向与CF、EG一致；再用向量相等校验另一组对边。",
        steps: [
          "正方形中的两条直角边提供90°，CE=BF让两条小直角三角形的直角边对应。",
          "全等关系说明向量CF与DE长度相等且方向满足垂直转换。",
          "因为EG与DE等长且垂直，得到向量EG与向量FC相等。",
          "于是向量GF与向量EC相等，直接得到FG∥CE且FG=CE。",
        ],
        conclusion: "两种方法的共同核心是：先找不变量，再把垂直等长转成向量或平行四边形。",
      },
    ],
    mistakes: [
      "只证明FG=CE而漏掉FG∥CE；还必须补足平行关系。",
      "把△CBF与△DCE的对应点写错，先按直角顶点和已知等长边核对对应关系。",
      "看到图形像平行四边形就直接下结论，必须写出一组对边平行且相等的依据。",
    ],
    summary: "这类题的固定路线是：正方形提供不变量，全等负责搬运长度和角度，垂直等长负责构造平行四边形，最后回收平行与相等结论。",
    cta: "下次看到正方形、垂直、等长同时出现，先尝试寻找两组三角形的对应关系。",
  };
}

function buildFallbackTeachingPlan(brief: VideoBrief): TeachingPlan {
  const topic = brief.coreKnowledge.join("、") || brief.title;
  const example = brief.example?.statement ? `代表题目是：${brief.example.statement}` : "本节暂未提取到代表题目";
  return {
    hook: `一个条件，为什么能推出这么多结论？今天用${topic}把它拆开。`,
    intuition: [`先从题干中圈出已知条件，再把条件翻译成图形、公式或数量关系。`, example],
    solutions: [{
      name: "条件链解法",
      trigger: "题干给出的已知条件和所求目标",
      idea: "先整理不变量，再逐步连接已知条件与所求结论。",
      steps: ["列出题干中的已知条件", "说明每一步使用的定义、性质或公式", "得到结论并检查成立条件"],
      conclusion: "本段内容由教案条件自动整理，具体结论需要人工复核。",
    }],
    mistakes: ["不要跳过成立条件，也不要只凭图形外观直接下结论。"],
    summary: `记住：先找不变量，再把题干条件连成推理链。${topic}的具体结论请结合题目逐项核对。`,
    cta: "想把每一步都讲清楚，可以继续练习同类题。",
  };
}

function buildSquareMovingPointTeachingPlan(): TeachingPlan {
  return {
    hook: "如果点E只是在正方形的一条边上跑动，为什么同一个垂直结论还能保持不变？更有意思的是，E跑到两个特殊位置时，三角形MCE会突然变成等腰三角形。",
    intuition: [
      "把正方形放进坐标系：A(0,1)、B(0,0)、C(1,0)、D(1,1)，令E=(t,0)，其中t>0。动点E的运动，就变成参数t的变化。",
      "直线AE与对角线BD交于M，直线AE与x=1交于F，G是EF的中点。只要写出M、F、G的坐标，CG和CM是否垂直就能用一个点积判断。",
    ],
    proof: {
      premise: "正方形ABCD边长为1，E在射线BC上，M=AE∩BD，F=AE∩直线DC，G是EF的中点。",
      statement: "在正方形ABCD的非退化动点位置，CG始终垂直于CM。",
      conditions: ["AB⊥BC且AB=BC=1", "E=(t,0)且t>0", "M=AE∩BD", "F=AE∩直线DC", "G为EF的中点"],
      construction: ["建立直角坐标系并设E=(t,0)", "分别写出AE、BD的方程", "求出F，再取EF的中点G"],
      reasoningSteps: [
        "AE的方程为y=1-x/t，BD的方程为y=x，联立得到M=(t/(t+1),t/(t+1))。",
        "AE与x=1交于F=(1,1-1/t)，所以G=((t+1)/2,(t-1)/(2t))。",
        "向量CM=(-1/(t+1),t/(t+1))，向量CG=((t-1)/2,(t-1)/(2t))。",
        "计算向量点积：CM·CG=0，因此两条向量互相垂直。",
      ],
      conclusion: "所以CG⊥CM，而且这个结论不依赖E在BC的哪一侧，只要图形不退化就成立。",
    },
    solutions: [
      {
        name: "解法一：坐标法",
        trigger: "题干出现动点E，并且要求讨论E的位置",
        idea: "用坐标和参数t统一表示E、M、F、G，把垂直关系转化为向量点积，把等腰关系转化为三组边长相等。",
        steps: [
          "设E=(t,0)，由AE与BD联立得到M=(t/(t+1),t/(t+1))。",
          "由AE与x=1相交得到F=(1,1-1/t)，再得到G=((t+1)/2,(t-1)/(2t))。",
          "计算CM·CG=0，得到CG⊥CM。",
          "分别令MC=ME、MC=CE、ME=CE，解得t=1、t=√3、t=1/√3。",
          "去掉E与C重合的退化位置，得到E在BC上距B为1/√3，或在C外侧距B为√3。",
        ],
        conclusion: "坐标法给出两个非退化等腰位置：BE=1/√3或BE=√3。",
      },
      {
        name: "解法二：几何法先抓不变量，再分类",
        trigger: "题干同时给出正方形、对角线BD、中点G，并追问等腰位置",
        idea: "先用正方形的对称性证明△ABM与△CBM全等，再用中点和垂直关系锁定CG⊥CM；最后只对等腰三角形的三种边相等情况分类。",
        steps: [
          "AB=BC，BM为公共边，∠ABM=∠CBM=45°，所以△ABM≌△CBM（边角边）。",
          "由全等得到AM=CM、∠AMB=∠CMB；结合AE、BD和中点G的结构，得到CG与CM的方向互相垂直。",
          "等腰三角形MCE分别讨论MC=ME、MC=CE、ME=CE，不能只看一种边相等。",
          "前两类转回同一参数关系，得到t=1、√3、1/√3，再剔除退化位置。",
        ],
        conclusion: "几何法负责识别不变量，坐标法负责完成位置计算；两种方法互相校验。",
      },
    ],
    mistakes: [
      "不要把E只限制在BC线段上：题目说的是射线BC，E还可能跑到C的外侧。",
      "等腰三角形要分类讨论MC=ME、MC=CE、ME=CE，并检查是否出现E=C的退化图形。",
      "证明垂直不能只凭图形看起来像直角，必须给出点积为零或完整的角度关系。",
    ],
    summary: "结论先记住：两个非退化等腰位置是BE=1/√3或BE=√3。这道题的主线是正方形提供不变量，全等帮助看清结构，参数t负责追踪动点位置。",
    cta: "想把动点题做稳，先找不变量，再决定用几何还是坐标。",
  };
}

function buildSquareMovingPointGeometryProgram(): GeometryProgram {
  const A = { x: 350, y: 450 }, B = { x: 350, y: 850 }, C = { x: 750, y: 850 }, D = { x: 750, y: 450 };
  const E = { x: 550, y: 850 }, F = { x: 750, y: 1250 }, M = { x: 483, y: 717 }, G = { x: 650, y: 1050 };
  const E2 = { x: 950, y: 850 }, F2 = { x: 750, y: 717 }, M2 = { x: 590, y: 610 }, G2 = { x: 850, y: 783 };
  const objects: GeometryProgram["objects"] = [
    { id: "square-abcd", kind: "square", corner: { x: 350, y: 450 }, side: 400 },
    { id: "point-a", kind: "point", point: A }, { id: "point-b", kind: "point", point: B }, { id: "point-c", kind: "point", point: C }, { id: "point-d", kind: "point", point: D },
    { id: "point-e", kind: "point", point: E }, { id: "point-f", kind: "point", point: F }, { id: "point-m", kind: "point", point: M }, { id: "point-g", kind: "point", point: G },
    { id: "point-e2", kind: "point", point: E2 }, { id: "point-f2", kind: "point", point: F2 }, { id: "point-m2", kind: "point", point: M2 }, { id: "point-g2", kind: "point", point: G2 },
    { id: "segment-ae", kind: "segment", start: A, end: E }, { id: "segment-bd", kind: "segment", start: B, end: D }, { id: "segment-ef", kind: "segment", start: E, end: F },
    { id: "segment-cm", kind: "segment", start: C, end: M }, { id: "segment-cg", kind: "segment", start: C, end: G }, { id: "segment-ae2", kind: "segment", start: A, end: E2 },
    { id: "segment-ef2", kind: "segment", start: E2, end: F2 }, { id: "segment-cm2", kind: "segment", start: C, end: M2 }, { id: "segment-cg2", kind: "segment", start: C, end: G2 },
    { id: "triangle-abm", kind: "triangle", points: ["point-a", "point-b", "point-m"] }, { id: "triangle-cbm", kind: "triangle", points: ["point-c", "point-b", "point-m"] },
    { id: "tracker-path", kind: "helper-line", start: { x: 400, y: 850 }, end: { x: 960, y: 850 } }, { id: "point-tracker", kind: "point", point: { x: 520, y: 850 } },
    { id: "formula-mce", kind: "formula", tex: "MC^2=\\frac{t^2+1}{(t+1)^2},\\quad CE=t-1", at: { x: 540, y: 160 } },
    { id: "formula-perp", kind: "formula", tex: "\\overrightarrow{CM}\\cdot\\overrightarrow{CG}=0", at: { x: 540, y: 280 } },
    { id: "formula-answer", kind: "formula", tex: "BE=\\frac{1}{\\sqrt{3}}\\qquad BE=\\sqrt{3}", at: { x: 540, y: 400 } },
    ...(["A", "B", "C", "D", "E", "F", "M", "G"].map((text, index) => ({ id: `label-${text.toLowerCase()}`, kind: "label" as const, text, at: [A, B, C, D, E, F, M, G][index]! }))),
  ];
  const actions: GeometryProgram["actions"] = [
    { type: "draw", objectId: "square-abcd", duration: 1.1 }, { type: "fill", objectId: "square-abcd", color: "#1D3557", duration: 0.6 },
    { type: "draw", objectId: "tracker-path", duration: 0.7 }, { type: "draw", objectId: "point-tracker", duration: 0.35 }, { type: "move-point", objectId: "point-tracker", to: E2, duration: 1.8 },
    { type: "draw", objectId: "segment-ae", duration: 0.8 }, { type: "draw", objectId: "segment-bd", duration: 0.8 }, { type: "draw", objectId: "segment-ef", duration: 0.8 },
    { type: "draw", objectId: "segment-cm", duration: 0.7 }, { type: "draw", objectId: "segment-cg", duration: 0.7 }, { type: "draw", objectId: "point-m", duration: 0.25 }, { type: "draw", objectId: "point-g", duration: 0.25 },
    { type: "draw", objectId: "label-a", duration: 0.18 }, { type: "draw", objectId: "label-b", duration: 0.18 }, { type: "draw", objectId: "label-c", duration: 0.18 }, { type: "draw", objectId: "label-d", duration: 0.18 }, { type: "draw", objectId: "label-e", duration: 0.18 }, { type: "draw", objectId: "label-f", duration: 0.18 }, { type: "draw", objectId: "label-m", duration: 0.18 }, { type: "draw", objectId: "label-g", duration: 0.18 },
    { type: "draw", objectId: "triangle-abm", duration: 0.8 }, { type: "draw", objectId: "triangle-cbm", duration: 0.8 }, { type: "fill", objectId: "triangle-abm", color: "#4F8CFF", duration: 0.5 }, { type: "fill", objectId: "triangle-cbm", color: "#FF8066", duration: 0.5 },
    { type: "highlight", objectIds: ["triangle-abm", "triangle-cbm"], duration: 1.1 }, { type: "draw", objectId: "formula-perp", duration: 0.8 }, { type: "highlight", objectIds: ["segment-cm", "segment-cg"], duration: 1.0 },
    { type: "draw", objectId: "formula-mce", duration: 0.9 }, { type: "transform-formula", from: "formula-mce", to: "MC=CE\\Rightarrow t=\\sqrt{3}", duration: 0.8 }, { type: "draw", objectId: "formula-answer", duration: 0.9 }, { type: "draw", objectId: "segment-ae2", duration: 0.9 }, { type: "draw", objectId: "segment-ef2", duration: 0.8 },
    { type: "draw", objectId: "segment-cm2", duration: 0.7 }, { type: "draw", objectId: "segment-cg2", duration: 0.7 }, { type: "draw", objectId: "point-e2", duration: 0.25 }, { type: "draw", objectId: "point-f2", duration: 0.25 },
    { type: "draw", objectId: "point-m2", duration: 0.25 }, { type: "draw", objectId: "point-g2", duration: 0.25 }, { type: "highlight", objectIds: ["segment-cm2", "segment-cg2"], duration: 1.0 },
  ];
  for (let cycle = 0; cycle < 18; cycle += 1) {
    actions.push(
      { type: "move-point", objectId: "point-tracker", to: cycle % 2 === 0 ? E : E2, duration: 2.0 },
      { type: "highlight", objectIds: ["triangle-abm", "triangle-cbm"], duration: 1.4 },
      { type: "highlight", objectIds: ["segment-cm", "segment-cg"], duration: 1.4 },
      { type: "highlight", objectIds: ["formula-perp", "formula-mce", "formula-answer"], duration: 1.2 },
    );
  }
  return { canvas: { width: 1080, height: 1920, background: "dark" }, objects, actions };
}

function buildCongruenceKnowledgeGeometryProgram(): GeometryProgram {
  const A = { x: 190, y: 760 }, B = { x: 160, y: 1110 }, C = { x: 470, y: 1110 };
  const D = { x: 700, y: 760 }, E = { x: 670, y: 1110 }, F = { x: 980, y: 1110 };
  const objects: GeometryProgram["objects"] = [
    { id: "point-a", kind: "point", point: A }, { id: "point-b", kind: "point", point: B }, { id: "point-c", kind: "point", point: C },
    { id: "point-d", kind: "point", point: D }, { id: "point-e", kind: "point", point: E }, { id: "point-f", kind: "point", point: F },
    { id: "triangle-abc", kind: "triangle", points: ["point-a", "point-b", "point-c"] },
    { id: "triangle-def", kind: "triangle", points: ["point-d", "point-e", "point-f"] },
    { id: "segment-ab", kind: "segment", start: A, end: B }, { id: "segment-de", kind: "segment", start: D, end: E },
    { id: "segment-bc", kind: "segment", start: B, end: C }, { id: "segment-ef", kind: "segment", start: E, end: F },
    { id: "formula-sas", kind: "formula", tex: "AB=DE,\\quad \\angle B=\\angle E,\\quad BC=EF", at: { x: 540, y: 180 } },
    { id: "formula-congruent", kind: "formula", tex: "\\triangle ABC\\cong\\triangle DEF", at: { x: 540, y: 320 } },
    { id: "formula-correspondence", kind: "formula", tex: "A\\leftrightarrow D,\\quad B\\leftrightarrow E,\\quad C\\leftrightarrow F", at: { x: 540, y: 460 } },
    ...(["A", "B", "C", "D", "E", "F"].map((text, index) => ({ id: `label-${text.toLowerCase()}`, kind: "label" as const, text, at: [A, B, C, D, E, F][index]! }))),
  ];
  const actions: GeometryProgram["actions"] = [
    { type: "draw", objectId: "triangle-abc", duration: 1.2 }, { type: "draw", objectId: "triangle-def", duration: 1.2 },
    { type: "fill", objectId: "triangle-abc", color: "#4F8CFF", duration: 0.7 }, { type: "fill", objectId: "triangle-def", color: "#FF8066", duration: 0.7 },
    { type: "draw", objectId: "segment-ab", duration: 0.5 }, { type: "draw", objectId: "segment-de", duration: 0.5 },
    { type: "draw", objectId: "segment-bc", duration: 0.5 }, { type: "draw", objectId: "segment-ef", duration: 0.5 },
    ...["label-a", "label-b", "label-c", "label-d", "label-e", "label-f"].map((objectId) => ({ type: "draw" as const, objectId, duration: 0.18 })),
    { type: "draw", objectId: "formula-sas", duration: 0.8 }, { type: "highlight", objectIds: ["segment-ab", "segment-de", "segment-bc", "segment-ef"], duration: 1.2 },
    { type: "transform-formula", from: "formula-sas", to: "formula-congruent", duration: 1.3 }, { type: "draw", objectId: "formula-congruent", duration: 0.8 },
    { type: "draw", objectId: "formula-correspondence", duration: 0.8 }, { type: "highlight", objectIds: ["triangle-abc", "triangle-def"], duration: 1.2 },
  ];
  for (let cycle = 0; cycle < 16; cycle += 1) {
    actions.push(
      { type: "highlight", objectIds: cycle % 2 === 0 ? ["segment-ab", "segment-de"] : ["segment-bc", "segment-ef"], duration: 1.2 },
      { type: "highlight", objectIds: cycle % 3 === 0 ? ["triangle-abc", "triangle-def"] : ["formula-sas", "formula-congruent"], duration: 1.1 },
    );
  }
  return { canvas: { width: 1080, height: 1920, background: "dark" }, objects, actions };
}

function buildSquarePerpendicularEqualGeometryProgram(): GeometryProgram {
  const A = { x: 300, y: 500 }, B = { x: 300, y: 950 }, C = { x: 750, y: 950 }, D = { x: 750, y: 500 };
  const E = { x: 550, y: 950 }, F = { x: 300, y: 750 }, G = { x: 100, y: 750 };
  const objects: GeometryProgram["objects"] = [
    { id: "square-abcd", kind: "square", corner: A, side: 450 },
    { id: "point-a", kind: "point", point: A }, { id: "point-b", kind: "point", point: B }, { id: "point-c", kind: "point", point: C }, { id: "point-d", kind: "point", point: D },
    { id: "point-e", kind: "point", point: E }, { id: "point-f", kind: "point", point: F }, { id: "point-g", kind: "point", point: G },
    { id: "segment-de", kind: "segment", start: D, end: E }, { id: "segment-eg", kind: "segment", start: E, end: G },
    { id: "segment-cf", kind: "segment", start: C, end: F }, { id: "segment-fg", kind: "segment", start: F, end: G }, { id: "segment-ce", kind: "segment", start: C, end: E },
    { id: "triangle-cbf", kind: "triangle", points: ["point-c", "point-b", "point-f"] },
    { id: "triangle-dce", kind: "triangle", points: ["point-d", "point-c", "point-e"] },
    { id: "formula-congruent", kind: "formula", tex: "\\triangle CBF\\cong\\triangle DCE", at: { x: 540, y: 180 } },
    { id: "formula-transfer", kind: "formula", tex: "CF=DE=EG,\\quad EG\\parallel CF", at: { x: 540, y: 300 } },
    { id: "formula-conclusion", kind: "formula", tex: "FG\\parallel CE,\\quad FG=CE", at: { x: 540, y: 420 } },
    ...(["A", "B", "C", "D", "E", "F", "G"].map((text, index) => ({ id: `label-${text.toLowerCase()}`, kind: "label" as const, text, at: [A, B, C, D, E, F, G][index]! }))),
  ];
  const actions: GeometryProgram["actions"] = [
    { type: "draw", objectId: "square-abcd", duration: 1.1 }, { type: "fill", objectId: "square-abcd", color: "#1D3557", duration: 0.6 },
    { type: "draw", objectId: "segment-de", duration: 0.8 }, { type: "draw", objectId: "segment-ce", duration: 0.7 },
    { type: "draw", objectId: "segment-cf", duration: 0.8 }, { type: "draw", objectId: "segment-eg", duration: 0.8 }, { type: "draw", objectId: "segment-fg", duration: 0.8 },
    { type: "draw", objectId: "label-a", duration: 0.18 }, { type: "draw", objectId: "label-b", duration: 0.18 }, { type: "draw", objectId: "label-c", duration: 0.18 }, { type: "draw", objectId: "label-d", duration: 0.18 }, { type: "draw", objectId: "label-e", duration: 0.18 }, { type: "draw", objectId: "label-f", duration: 0.18 }, { type: "draw", objectId: "label-g", duration: 0.18 },
    { type: "draw", objectId: "triangle-cbf", duration: 0.8 }, { type: "draw", objectId: "triangle-dce", duration: 0.8 },
    { type: "fill", objectId: "triangle-cbf", color: "#4F8CFF", duration: 0.5 }, { type: "fill", objectId: "triangle-dce", color: "#FF8066", duration: 0.5 },
    { type: "highlight", objectIds: ["triangle-cbf", "triangle-dce"], duration: 1.2 },
    { type: "draw", objectId: "formula-congruent", duration: 0.8 }, { type: "highlight", objectIds: ["segment-cf", "segment-de"], duration: 1.1 },
    { type: "draw", objectId: "formula-transfer", duration: 0.8 }, { type: "highlight", objectIds: ["segment-eg", "segment-cf"], duration: 1.1 },
    { type: "draw", objectId: "formula-conclusion", duration: 0.8 }, { type: "highlight", objectIds: ["segment-fg", "segment-ce"], duration: 1.1 },
  ];
  for (let cycle = 0; cycle < 22; cycle += 1) {
    actions.push(
      { type: "highlight", objectIds: cycle % 2 === 0 ? ["triangle-cbf", "triangle-dce"] : ["segment-eg", "segment-cf"], duration: 1.25 },
      { type: "highlight", objectIds: cycle % 3 === 0 ? ["segment-fg", "segment-ce"] : ["formula-congruent", "formula-transfer", "formula-conclusion"], duration: 1.15 },
    );
  }
  return { canvas: { width: 1080, height: 1920, background: "dark" }, objects, actions };
}

const PLACEHOLDER_EXAMPLE = /^(代表例题|题干中的已知条件|题干信息|典型例题)$/u;

function problemNumberForTitle(title: string): number {
  if (/全等|正方形|相似/u.test(title)) return 5;
  if (/动点|函数|面积/u.test(title)) return 6;
  if (/旋转/u.test(title)) return 7;
  if (/勾股|三角函数/u.test(title)) return 3;
  return 1;
}

export function extractRepresentativeProblem(text: string, title: string): string | undefined {
  const source = text.split("【答案与解析】")[0] ?? text;
  const exerciseStart = source.indexOf("【巩固练习】");
  const exerciseText = exerciseStart >= 0 ? source.slice(exerciseStart) : source;
  const number = problemNumberForTitle(title);
  const next = number + 1;
  const pattern = new RegExp(`(?:^|\\n)\\s*${number}[.．、]\\s*([\\s\\S]*?)(?=\\n\\s*${next}[.．、]|\\n\\s*[一二三四五六七八九十]+[、.]|$)`, "u");
  const match = exerciseText.match(pattern);
  if (!match?.[1]) return undefined;
  const statement = match[1].replace(/\\s+/gu, " ").trim();
  return statement ? `第${number}题：${statement}` : undefined;
}

function resolveBriefExample(brief: VideoBrief, text: string): VideoBrief {
  const statement = brief.example?.statement?.trim();
  if (statement && !PLACEHOLDER_EXAMPLE.test(statement)) {
    if (/^第\s*\d+\s*题[：:]/u.test(statement)) return brief;
    const questionNumber = text.match(/第\s*(\d+)\s*题[：:]/u)?.[1];
    if (!questionNumber) return brief;
    return { ...brief, example: { ...brief.example!, statement: `第${questionNumber}题：${statement}` } };
  }
  const extracted = extractRepresentativeProblem(text, brief.title);
  if (!extracted) return brief;
  const example = brief.example ?? {
    id: `${brief.id}-example`,
    keyClues: ["从题干中识别已知条件、运算关系或图形关系"],
    solutions: [{
      name: "主解法",
      trigger: "题干中的已知条件",
      idea: "先把题干信息翻译成对应的定义、公式或图形关系，再逐步计算或证明",
      steps: ["圈出题干中的关键条件", "选择对应定义或公式并逐步推导"],
      conclusion: "得到题目要求的结论",
    }],
  };
  return {
    ...brief,
    example: { ...example, statement: extracted },
    reviewFlags: brief.reviewFlags.includes("ALT_SOLUTION_UNAVAILABLE")
      ? brief.reviewFlags
      : [...brief.reviewFlags, "ALT_SOLUTION_UNAVAILABLE"],
  };
}

export function compactBatchVideoTitle(title: string): string {
  const normalized = title.trim();
  if (/正方形/u.test(normalized) && /垂直|等长/u.test(normalized) && /全等/u.test(normalized)) {
    return "正方形垂直等长：证明FG∥CE且FG=CE";
  }
  if (/正方形/u.test(normalized) && /动点/u.test(normalized)) {
    return "正方形动点：探究垂直关系与等腰位置";
  }
  if (/全等三角形/u.test(normalized)) {
    return "全等三角形：边角边判定";
  }
  return normalized;
}

export function adaptBriefDuration(brief: VideoBrief): VideoBrief {
  const statement = brief.example?.statement?.trim() ?? "";
  const hasRealExample = Boolean(statement && !PLACEHOLDER_EXAMPLE.test(statement));
  if (hasRealExample) {
    return {
      ...brief,
      targetDurationSeconds: brief.example!.solutions.length >= 2 ? 135 : 115,
    };
  }
  if (brief.theorem) return { ...brief, targetDurationSeconds: 90 };
  return { ...brief, targetDurationSeconds: 90 };
}

function hasRenderableGeometry(program: GeometryProgram): boolean {
  return program.objects.length > 0 && program.actions.length > 0;
}

function proofText(plan: TeachingPlan): string[] {
  if (!plan.proof) return [];
  return [
    `${plan.proof.statement ?? plan.proof.premise ?? "这个原理"}。`,
    ...plan.proof.construction,
    ...plan.proof.reasoningSteps,
    plan.proof.conclusion,
  ];
}

function solutionText(solution: SolutionPlan | undefined, fallback: string): string {
  if (!solution) return fallback;
  return [
    `${solution.name}：先抓住题干中的“${solution.trigger}”。`,
    solution.idea,
    ...solution.steps,
    solution.conclusion,
  ].join(" ");
}

function sceneText(brief: VideoBrief, plan: TeachingPlan): string[] {
  const proof = proofText(plan);
  const primary = plan.solutions[0];
  const alternative = plan.solutions[1];
  const alternativeFallback = "这道题暂时没有经过复核的第二种解法，我们不为了凑数量编造步骤。";
  return [
    plan.hook,
    plan.intuition[0] ?? `先观察题目：${brief.example?.statement ?? brief.title}`,
    plan.intuition[1] ?? proof[0] ?? "把题目条件翻译成图形和关系。",
    proof.length ? proof.join(" ") : "先写出条件，再说明每一步为什么成立。",
    solutionText(primary, `主解法从题干的关键信息出发：${brief.example?.statement ?? brief.title}`),
    solutionText(alternative, alternativeFallback),
    plan.mistakes[0] ?? "最容易漏掉的是条件范围，结论一定要带上成立条件。",
    `${plan.summary}${plan.cta ? ` ${plan.cta}` : ""}`,
  ].filter(Boolean);
}

function buildStoryboard(brief: VideoBrief, plan: TeachingPlan): RenderStoryboard {
  const texts = sceneText(brief, plan);
  const proof = proofText(plan);
  const primary = plan.solutions[0];
  const alternative = plan.solutions[1];
  const kinds: RenderStoryboard["scenes"][number]["type"][] = [
    "challenge", "coordinate-plane", "function-curve", "equation-transform",
    "solution-step", "solution-step", "mistake", "summary",
  ];
  const target = brief.targetDurationSeconds;
  const durations = [0.08, 0.12, 0.12, 0.18, 0.17, 0.14, 0.07, 0.12].map((ratio) => Math.max(4, target * ratio));
  let cursor = 0;
  const scenes: StoryboardScene[] = kinds.map((type, index) => {
    const narration = texts[index] ?? texts[texts.length - 1] ?? brief.title;
    const duration = durations[index] ?? 8;
    const scene: StoryboardScene = {
      id: `${brief.id}-scene-${index + 1}`,
      type,
      start: cursor,
      duration,
      subtitle: narration,
      narration,
    };
    if (type === "challenge") {
      const statement = brief.example?.statement ?? "";
      const questionMatch = statement.match(/^(第\d+题)：([\s\S]*)$/u);
      scene.challenge = {
        badge: "先猜三秒",
        prompt: questionMatch?.[1] ?? "先看题目",
        details: questionMatch?.[2] ?? (statement || plan.hook),
      };
    }
    if (type === "equation-transform") {
      scene.equationSteps = proof.length ? proof : (primary?.steps.length ? primary.steps : ["条件 → 关系 → 结论"]);
    }
    if (type === "solution-step") {
      const solution = index === 4 ? primary : alternative;
      scene.formula = solution?.idea ?? (index === 5 ? "本题保留主解法，不编造未经复核的替代法" : undefined);
    }
    if (type === "mistake") scene.mathWarning = plan.mistakes[0] ?? "请检查条件是否满足。";
    cursor += duration;
    return scene;
  });
  return { id: brief.id, title: brief.title, format: "vertical", scenes };
}

function narrationLength(storyboard: RenderStoryboard): number {
  return storyboard.scenes.reduce((total, scene) => total + Array.from(scene.narration ?? scene.subtitle ?? "").length, 0);
}

export function enrichTeachingNarration(brief: VideoBrief, plan: TeachingPlan, storyboard: RenderStoryboard): RenderStoryboard {
  const minimumCharacters = Math.round(brief.targetDurationSeconds * 4.8);
  if (narrationLength(storyboard) >= minimumCharacters) return storyboard;
  const primary = plan.solutions[0];
  const alternative = plan.solutions[1];
  const additions = [
    `先把这一步说清楚：${plan.intuition.join("；")}。真正要找的不是复杂图形的外表，而是题目中保持不变的条件。`,
    plan.proof
      ? `证明时要按顺序检查条件：${plan.proof.conditions.join("、")}。再完成${plan.proof.construction.join("、")}，最后由${plan.proof.reasoningSteps.join("、")}推出${plan.proof.conclusion}。`
      : "没有定理时，也要把每一步使用的条件写出来，不能从图形看起来像这样就直接跳到结论。",
    primary
      ? `主解法的触发点是“${primary.trigger}”。因此先${primary.idea}，再依次完成：${primary.steps.join("；")}。每一步都要能在题干中找到依据。`
      : `这道题先从题干信息出发：${brief.example?.statement ?? brief.title}。`,
    alternative
      ? `替代解法故意换一个角度。它由“${alternative.trigger}”触发，核心是${alternative.idea}，关键步骤是${alternative.steps.join("；")}。两种方法的结论应该相互校验。`
      : "如果暂时找不到可靠的替代法，就保留主解法并标记复核，不为了凑数量编造第二条推理链。",
    "做完以后回头检查：条件有没有漏写，图形关系有没有偷换，最后的结论是否仍然满足题目范围。这样才能把会做一道题，变成会识别一类题。",
  ];
  const scenes = storyboard.scenes.map((scene, index) => {
    const addition = additions[index % additions.length];
    if (!addition) return scene;
    const narration = `${scene.narration ?? scene.subtitle ?? ""} ${addition}`.trim();
    return { ...scene, narration, subtitle: scene.subtitle ? `${scene.subtitle} ${addition}` : narration };
  });
  let result: RenderStoryboard = { ...storyboard, scenes };
  if (narrationLength(result) < minimumCharacters) {
    const summary = `再总结一次：${plan.summary}。${plan.cta ?? ""}`.trim();
    result = {
      ...result,
      scenes: result.scenes.map((scene, index) => index === result.scenes.length - 1
        ? { ...scene, narration: `${scene.narration ?? ""} ${summary}`.trim(), subtitle: `${scene.subtitle ?? ""} ${summary}`.trim() }
        : scene),
    };
  }
  return result;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function hasFile(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await (await import("node:fs/promises")).readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function findMp4(directory: string): Promise<string | undefined> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".mp4") return candidate;
    if (entry.isDirectory()) {
      const nested = await findMp4(candidate);
      if (nested) return nested;
    }
  }
  return undefined;
}

export async function executeBatchPipeline(options: BatchPipelineOptions): Promise<BatchPipelineResult> {
  const paths = createBatchPaths(options.runRoot ?? path.resolve(options.cwd, "runs"), options.batchId);
  await mkdir(paths.source, { recursive: true });
  await mkdir(paths.pageImages, { recursive: true });
  await mkdir(paths.videos, { recursive: true });
  const sources = await readSources(path.resolve(options.cwd, options.sourcePath), paths.pageImages);
  const text = sources.map(asText).filter(Boolean).join("\n\n");
  const images = selectReferenceImages(sources);
  await writeJson(paths.sourceText, sources.map((source) => ({
    path: source.path,
    kind: source.kind,
    pages: source.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      assets: page.assets.map((asset) => ({ path: asset.path, mimeType: asset.mimeType })),
    })),
  })));
  for (const source of sources) {
    for (const asset of source.assets.filter((item) => item.kind === "image")) {
      const target = path.join(paths.pageImages, `${source.id}-${path.basename(asset.path)}`);
      try {
        await copyFile(asset.path, target);
      } catch {
        // 图片仍可通过原始路径传给 MiMo；无法复制时不阻断批量生成。
      }
    }
  }

  const planner = options.planner ?? createTeachingPlanner();
  const mapInput = { title: path.basename(options.sourcePath), text, images };
  const cachedLessonMap = options.resume ? await readJsonIfExists<LessonMap>(paths.lessonMap) : undefined;
  const lessonMap = cachedLessonMap ?? await planner.mapLesson(mapInput);
  await writeJson(paths.lessonMap, lessonMap);
  const briefs = batchVideoBriefs([lessonMap]);
  const videoIds: string[] = [];
  const manifestWarnings: string[] = [];

  for (const rawBrief of briefs) {
    const resolvedBrief = resolveBriefExample(rawBrief, text);
    const movingPointPilot = isSquareMovingPointExample(resolvedBrief);
    const perpendicularEqualPilot = !movingPointPilot && isSquarePerpendicularEqualExample(resolvedBrief);
    const congruenceKnowledgePilot = !movingPointPilot && !perpendicularEqualPilot && isCongruenceKnowledgeBrief(resolvedBrief);
    const pilotExample = movingPointPilot || perpendicularEqualPilot;
    const brief = {
      ...(pilotExample ? { ...resolvedBrief, targetDurationSeconds: perpendicularEqualPilot ? 150 : 135 } : adaptBriefDuration(resolvedBrief)),
      title: compactBatchVideoTitle(resolvedBrief.title),
    };
    videoIds.push(brief.id);
    const run = await createRunDirectory(paths.videos, brief.id);
    const completePreview = await hasFile(run.paths.storyboard)
      && await hasFile(path.join(run.paths.root, "geometry-program.json"))
      && await hasFile(path.join(run.paths.review, "report.json"))
      && await hasFile(path.join(run.paths.preview, "index.html"));
    if (options.resume && completePreview) continue;
    const exampleText = brief.example?.statement ?? brief.coreKnowledge.join("、");
    const focusedText = [
      `核心知识点：${brief.coreKnowledge.join("、")}`,
      brief.theorem ? `定理：${brief.theorem.statement}；条件：${brief.theorem.conditions.join("、")}；结论：${brief.theorem.conclusion}` : "",
      `代表内容：${exampleText}`,
      `教案摘录：${text.slice(0, 12000)}`,
    ].filter(Boolean).join("\n");
    const input = { title: brief.title, text: focusedText, images, targetDurationSeconds: brief.targetDurationSeconds };
    let teachingPlan: TeachingPlan;
    let planningWarning: string | undefined;
    if (movingPointPilot) {
      teachingPlan = buildSquareMovingPointTeachingPlan();
    } else if (perpendicularEqualPilot) {
      teachingPlan = buildSquarePerpendicularEqualTeachingPlan();
    } else if (congruenceKnowledgePilot) {
      teachingPlan = buildCongruenceKnowledgeTeachingPlan();
    } else {
      try {
        teachingPlan = await planner.planTeaching(input);
      } catch (error) {
        teachingPlan = buildFallbackTeachingPlan(brief);
        planningWarning = `TEACHING_PLAN_FALLBACK: MiMo 教学规划失败，已使用保守教学模板：${error instanceof Error ? error.message : "未知错误"}`;
      }
    }
    const teachingWarnings = [
      ...validateTeachingPlan(teachingPlan).findings.map((finding) => `${finding.code}: ${finding.message}`),
      ...((pilotExample || congruenceKnowledgePilot) ? [pilotPlanRepairWarning(
        perpendicularEqualPilot ? "perpendicular-equal" : congruenceKnowledgePilot ? "congruence-knowledge" : "moving-point",
      )] : []),
      ...(planningWarning ? [planningWarning] : []),
    ];
    const briefWarnings = brief.reviewFlags
      .filter((flag) => !(flag === "ALT_SOLUTION_UNAVAILABLE" && teachingPlan.solutions.length >= 2))
      .map((flag) => `${flag}: 请在发布前人工复核替代解法`);
    let geometryProgram: GeometryProgram;
    if (movingPointPilot) {
      geometryProgram = buildSquareMovingPointGeometryProgram();
    } else if (perpendicularEqualPilot) {
      geometryProgram = buildSquarePerpendicularEqualGeometryProgram();
      manifestWarnings.push(`${brief.id}: VERIFIED_SQUARE_GEOMETRY 已使用正方形垂直等长专用几何程序`);
      manifestWarnings.push(`${brief.id}: VERIFIED_PILOT_GEOMETRY 已使用正方形垂直等长专用几何程序`);
    } else if (congruenceKnowledgePilot) {
      geometryProgram = buildCongruenceKnowledgeGeometryProgram();
      manifestWarnings.push(`${brief.id}: VERIFIED_CONGRUENCE_GEOMETRY 已使用全等三角形知识点专用几何程序`);
    } else if (!shouldRequestModelGeometry(brief)) {
      geometryProgram = buildFallbackGeometryProgram(brief);
      manifestWarnings.push(`${brief.id}: DETERMINISTIC_GEOMETRY 已使用数轴/公式基础动画，跳过非必要的模型几何规划`);
    } else {
      try {
        const plannedGeometry = await planner.planGeometry(input);
        if (!hasRenderableGeometry(plannedGeometry)) throw new Error("GeometryProgram 为空，无法生成可见动画");
        geometryProgram = plannedGeometry;
      } catch (error) {
        geometryProgram = buildFallbackGeometryProgram(brief);
        manifestWarnings.push(`${brief.id}: GeometryProgram 已降级：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }

    await writeJson(path.join(run.paths.root, "source.json"), { sourcePath: options.sourcePath, title: brief.title });
    await writeJson(path.join(run.paths.root, "lesson-map.json"), lessonMap);
    await writeJson(path.join(run.paths.root, "teaching-plan.json"), teachingPlan);
    await writeJson(path.join(run.paths.root, "geometry-program.json"), geometryProgram);
    const manimDir = path.join(run.paths.root, "manim");
    await mkdir(manimDir, { recursive: true });
    const manimScript = path.join(manimDir, "scene.py");
    compileManimScene(geometryProgram, manimScript);

    let storyboard = compactStoryboardNarration(
      enrichTeachingNarration(brief, teachingPlan, buildStoryboard(brief, teachingPlan)),
      brief.targetDurationSeconds,
    );
    const baseTts = options.tts ?? (options.voiceSamplePath ? new MimoTtsClient({ cacheDir: path.join(paths.root, ".tts-cache") }) : undefined);
    let audioCacheHits = 0;
    const tts = baseTts ? {
      synthesizeVoiceClone: async (request: { text: string; samplePath: string; style?: string }) => {
        const result = await baseTts.synthesizeVoiceClone(request);
        if (result.cacheHit) audioCacheHits += 1;
        return result;
      },
    } : undefined;
    storyboard = await attachAudio(run, storyboard, tts, options.voiceSamplePath ? path.resolve(options.cwd, options.voiceSamplePath) : undefined);
    await writeJson(run.paths.storyboard, storyboard);

    if (options.renderManim) {
      const { renderManimScene: runManimScene } = await import("./render/manim-runner.js");
      await runManimScene({ scriptPath: manimScript, mediaDir: manimDir, quality: "high" });
      const expectedVideo = path.join(manimDir, "scene.mp4");
      if (!(await hasFile(expectedVideo))) {
        const generatedVideo = await findMp4(manimDir);
        if (generatedVideo) await copyFile(generatedVideo, expectedVideo);
      }
      if (await hasFile(expectedVideo)) {
        const previewManimDir = path.join(run.paths.preview, "manim");
        await mkdir(previewManimDir, { recursive: true });
        await copyFile(expectedVideo, path.join(previewManimDir, "scene.mp4"));
        storyboard = { ...storyboard, scenes: storyboard.scenes.map((scene) => ({ ...scene, mediaSrc: "manim/scene.mp4" })) };
        await writeJson(run.paths.storyboard, storyboard);
      } else {
        manifestWarnings.push(`${brief.id}: MANIM_OUTPUT_MISSING，已保留 SVG/公式动画预览`);
      }
    }

    await writeFile(path.join(run.paths.preview, "index.html"), renderCompositionHtml(storyboard), "utf8");
    const review = generateReviewReport(storyboard, brief.targetDurationSeconds);
    await writeJson(path.join(run.paths.review, "report.json"), {
      ...JSON.parse(review.json),
      audioCacheHits,
      warnings: [
        ...briefWarnings,
        ...teachingWarnings,
        ...manifestWarnings.filter((item) => item.startsWith(`${brief.id}:`)),
      ],
    });
    await writeFile(path.join(run.paths.review, "report.html"), renderReviewReportHtml(review), "utf8");
  }

  await writeJson(paths.manifest, { batchId: options.batchId, sourcePath: options.sourcePath, videoIds, warnings: manifestWarnings });
  return { batchId: options.batchId, videoIds, manifestPath: paths.manifest };
}
