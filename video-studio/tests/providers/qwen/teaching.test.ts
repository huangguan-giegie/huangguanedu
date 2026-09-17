import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeQwenGeometryProgram, normalizeQwenTeachingPlan, QwenTeachingClient } from "../../../src/providers/qwen/teaching.js";

afterEach(() => vi.unstubAllEnvs());

const lessonMap = {
  id: "parallel-lines",
  title: "平行线与角",
  coreKnowledge: ["同位角相等"],
  theorems: [],
  examples: [],
};

const teachingPlan = {
  hook: "两条不相交的直线，为什么能锁定角度？",
  intuition: ["先找平行关系，再找角的对应位置"],
  solutions: [{
    name: "主解法",
    trigger: "题干给出两直线平行",
    idea: "利用同位角相等",
    steps: ["识别同位角", "应用平行线性质"],
    conclusion: "得到所求角度",
  }],
  mistakes: ["不要混淆同位角和同旁内角"],
  summary: "先找平行关系，再选择角的性质",
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

describe("Qwen 教学规划客户端", () => {
  it("缺少 QWEN_API_KEY 和 DASHSCOPE_API_KEY 时返回中文错误", async () => {
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "");
    const client = new QwenTeachingClient({ fetch: vi.fn() as typeof fetch });

    await expect(client.mapLesson({ title: "几何教案", text: "平行线" })).rejects.toThrow("缺少 QWEN_API_KEY 或 DASHSCOPE_API_KEY");
  });

  it("支持使用 DASHSCOPE_API_KEY 作为备用密钥", async () => {
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "dashscope-secret");
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer dashscope-secret" });
      return responseFor(lessonMap);
    });

    await expect(new QwenTeachingClient({ fetch: fetcher, maxRetries: 0 }).mapLesson({ title: "几何教案", text: "平行线" }))
      .resolves.toMatchObject({ title: lessonMap.title });
  });

  it("使用配置的模型和端点生成教案地图、教学计划和几何程序", async () => {
    vi.stubEnv("QWEN_API_KEY", "secret");
    vi.stubEnv("QWEN_BASE_URL", "https://qwen.env.test/v1/chat/completions");
    vi.stubEnv("QWEN_MODEL", "qwen-env-test");
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("https://qwen.env.test/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("qwen-env-test");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].role).toBe("system");
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      const prompt = body.messages[0].content as string;
      if (prompt.includes("GeometryProgram")) return responseFor(geometryProgram);
      if (prompt.includes("TeachingPlan")) return responseFor(teachingPlan);
      return responseFor(lessonMap);
    });
    const client = new QwenTeachingClient({
      fetch: fetcher,
      maxRetries: 0,
    });

    await expect(client.mapLesson({ title: "几何教案", text: "平行线" })).resolves.toMatchObject({ title: lessonMap.title });
    await expect(client.planTeaching({ title: "平行线", text: "求角" })).resolves.toMatchObject({ hook: teachingPlan.hook });
    await expect(client.planGeometry({ title: "平行线", text: "作辅助线" })).resolves.toMatchObject({ canvas: geometryProgram.canvas });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("Qwen 返回 null 时按配置重试并返回中文错误", async () => {
    vi.stubEnv("QWEN_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => responseFor(null));
    const client = new QwenTeachingClient({ fetch: fetcher, maxRetries: 1 });

    await expect(client.planTeaching({ title: "几何", text: "三角形" })).rejects.toThrow("Qwen 教学规划失败");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("Qwen 返回非法 JSON 结构时按配置重试并返回中文错误", async () => {
    vi.stubEnv("QWEN_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => responseFor({ invalid: true }));
    const client = new QwenTeachingClient({ fetch: fetcher, maxRetries: 1 });

    await expect(client.planGeometry({ title: "几何", text: "三角形" })).rejects.toThrow("Qwen 几何规划失败");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("兼容 Qwen 返回的中文 LessonMap 包装结构", async () => {
    vi.stubEnv("QWEN_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => responseFor({
      LessonMap: {
        "核心知识点": "动点与正方形中的全等三角形",
        "定理条件": ["ABCD 为正方形", "E 在 BC 上运动"],
        "证明目标": "利用全等三角形得到长度关系",
        "代表例题": {
          "题干触发信息": "正方形、动点、等长条件",
          "可靠解法": "连接辅助线，构造一组全等三角形",
        },
      },
    }));

    await expect(new QwenTeachingClient({ fetch: fetcher, maxRetries: 0 }).mapLesson({
      title: "正方形动点例题",
      text: "在正方形 ABCD 中，点 E 在 BC 上运动。",
    })).resolves.toMatchObject({
      title: "正方形动点例题",
      coreKnowledge: ["动点与正方形中的全等三角形"],
      theorems: [{ conditions: ["ABCD 为正方形", "E 在 BC 上运动"] }],
      examples: [{ keyClues: ["正方形、动点、等长条件"], solutions: [{ name: "主解法" }] }],
    });
  });

  it("把 Qwen 教学计划中的单字符串步骤归一化为数组", () => {
    const normalized = normalizeQwenTeachingPlan({
      TeachingPlan: {
        hook: "先猜一猜",
        intuition: "观察图形变化",
        proof: {
          premise: "已知正方形",
          conditions: "两边相等且夹角相等",
          construction: "连接辅助线",
          reasoningSteps: "由全等三角形判定得到结论",
          conclusion: "两三角形全等",
        },
        solutions: {
          name: "主解法",
          trigger: "题干给出等长和直角",
          idea: "构造全等三角形",
          steps: "写出判定条件",
          conclusion: "得到答案",
        },
        mistakes: "不能漏写判定条件",
        summary: "先找触发信息，再选方法",
      },
    });

    expect(normalized).toMatchObject({
      intuition: ["观察图形变化"],
      proof: { conditions: ["两边相等且夹角相等"], construction: ["连接辅助线"], reasoningSteps: ["由全等三角形判定得到结论"] },
      solutions: [{ steps: ["写出判定条件"] }],
      mistakes: ["不能漏写判定条件"],
    });
  });

  it("把 Qwen 几何程序包装和非法背景值归一化", () => {
    const normalized = normalizeQwenGeometryProgram({
      GeometryProgram: {
        canvas: { width: 1080, height: 1920, background: "light" },
        objects: [{ id: "a", kind: "point", point: { x: 240, y: 520 } }],
        actions: [{ type: "draw", objectId: "a", duration: 1 }],
      },
    });

    expect(normalized).toMatchObject({
      canvas: { width: 1080, height: 1920, background: "dark" },
      objects: [{ id: "a" }],
      actions: [{ type: "draw", objectId: "a" }],
    });
  });
});
