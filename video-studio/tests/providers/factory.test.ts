import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeachingPlanner } from "../../src/providers/factory.js";
import { MimoTeachingClient } from "../../src/providers/mimo/teaching.js";
import { QwenTeachingClient } from "../../src/providers/qwen/teaching.js";

afterEach(() => vi.unstubAllEnvs());

describe("内容规划模型选择", () => {
  it("配置 Qwen key 时默认使用 Qwen", () => {
    vi.stubEnv("QWEN_API_KEY", "qwen-secret");
    vi.stubEnv("MIMO_API_KEY", "mimo-secret");

    expect(createTeachingPlanner()).toBeInstanceOf(QwenTeachingClient);
  });

  it("没有 Qwen key 时保留 MiMo 兼容回退", () => {
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "");
    vi.stubEnv("MIMO_API_KEY", "mimo-secret");

    expect(createTeachingPlanner()).toBeInstanceOf(MimoTeachingClient);
  });

  it("可以用环境变量显式锁定 MiMo", () => {
    vi.stubEnv("VIDEO_PLANNER_PROVIDER", "mimo");
    vi.stubEnv("QWEN_API_KEY", "qwen-secret");

    expect(createTeachingPlanner()).toBeInstanceOf(MimoTeachingClient);
  });
});
