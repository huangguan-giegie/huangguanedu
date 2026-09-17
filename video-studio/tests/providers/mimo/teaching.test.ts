import { describe, expect, it, vi } from "vitest";
import { MimoTeachingClient } from "../../../src/providers/mimo/teaching.js";

const lessonMap = {
  title: "平行线与三角形",
  coreKnowledge: ["平行线的性质"],
  theorems: [],
  examples: [{
    statement: "已知两直线平行，求角的度数。",
    keyInformation: ["两直线平行"],
    candidateSolutions: [{
      name: "同位角相等",
      trigger: "题干给出两直线平行",
      idea: "先找同位角",
      steps: ["识别同位角", "直接使用平行线性质"],
      conclusion: "得到角度",
    }],
  }],
};

const teachingPlan = {
  hook: "如果两条线永远不相交，角度会不会也藏着规律？",
  intuition: ["先观察图形变化"],
  proof: {
    statement: "平行线同位角相等",
    conditions: ["两直线平行"],
    construction: ["作一条截线"],
    reasoningSteps: ["利用对顶角和邻补角"],
    conclusion: "同位角相等",
  },
  solutions: [
    { name: "主解法", trigger: "题干给出平行", idea: "使用同位角", steps: ["找角", "代入性质"], conclusion: "求得角度" },
    { name: "替代法", trigger: "图中出现三角形", idea: "利用三角形内角和", steps: ["补出第三角", "使用内角和"], conclusion: "求得同一角度" },
  ],
  mistakes: ["不要把同旁内角误认为相等"],
  summary: "先找平行关系，再选择角度性质。",
  cta: "想系统掌握中考几何，欢迎参加课程。",
};

const geometryProgram = {
  canvas: { width: 1080, height: 1920, background: "paper" },
  objects: [{ id: "a", kind: "point", point: { x: 240, y: 520 } }],
  actions: [{ type: "draw", objectId: "a", duration: 1 }],
};

function responseFor(value: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("MiMo 教学规划客户端", () => {
  it("分别生成教案地图和三分钟教学计划", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    let call = 0;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      call += 1;
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mimo-v2.5");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].content).toContain("定理");
      return responseFor(call === 1 ? lessonMap : teachingPlan);
    });

    const client = new MimoTeachingClient({ fetch: fetcher });
    await expect(client.mapLesson({ title: "几何教案", text: "平行线的性质和一道例题" })).resolves.toMatchObject({ title: lessonMap.title });
    await expect(client.planTeaching({ title: "平行线的性质", text: "已知两直线平行，求角度" })).resolves.toMatchObject({
      solutions: [{ name: "主解法" }, { name: "替代法" }],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("结构错误时返回中文规划失败", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const client = new MimoTeachingClient({ fetch: vi.fn(async () => responseFor({})) as typeof fetch, maxRetries: 0 });
    await expect(client.mapLesson({ title: "教案", text: "内容" })).rejects.toThrow("MiMo 教学规划失败");
  });

  it("MiMo 返回 null 时按空响应重试并返回明确错误", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => responseFor(null));
    const client = new MimoTeachingClient({ fetch: fetcher, maxRetries: 1 });
    await expect(client.planTeaching({ title: "几何知识点", text: "正方形性质" })).rejects.toThrow("MiMo 教学规划失败");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("把教学内容转换为受约束的 GeometryProgram", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toContain("GeometryProgram");
      return responseFor(geometryProgram);
    });
    const client = new MimoTeachingClient({ fetch: fetcher, maxRetries: 0 });
    await expect(client.planGeometry({ title: "平行线", text: "作截线并观察角" })).resolves.toMatchObject({
      canvas: { width: 1080, height: 1920 },
      objects: [{ id: "a" }],
    });
  });
});
