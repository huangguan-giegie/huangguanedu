import { afterEach, describe, expect, it, vi } from "vitest";
import { MimoTeachingClient } from "../../../src/providers/mimo/teaching.js";

afterEach(() => vi.unstubAllEnvs());

describe("MiMo 兼容响应归一化", () => {
  it("兼容模型返回 problem、method 和字符串 steps 的教学地图", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const payload = {
      title: "平行线基础",
      coreKnowledge: ["同位角相等"],
      theorems: [],
      examples: [{
        problem: "已知两直线平行，求同位角的度数",
        solutions: [{
          method: "直接使用平行线性质",
          steps: "根据两直线平行，同位角相等，所以得到所求角。",
          explanation: "由题干中的平行条件触发。",
        }],
      }],
    };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await new MimoTeachingClient({ fetch: fetcher, maxRetries: 0 }).mapLesson({
      title: "平行线",
      text: "两直线平行，同位角相等。",
    });

    expect(result.examples[0]).toMatchObject({
      statement: "已知两直线平行，求同位角的度数",
      keyClues: ["题干中的平行条件"],
    });
    expect(result.examples[0]?.solutions[0]).toMatchObject({
      name: "直接使用平行线性质",
      trigger: "题干中的平行条件",
      steps: ["根据两直线平行，同位角相等，所以得到所求角。"],
    });
  });
});
