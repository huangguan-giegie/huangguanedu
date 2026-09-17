import { MimoTeachingClient } from "./mimo/teaching.js";
import { QwenTeachingClient } from "./qwen/teaching.js";

export type TeachingPlanner = {
  mapLesson: MimoTeachingClient["mapLesson"];
  planTeaching: MimoTeachingClient["planTeaching"];
  planGeometry: MimoTeachingClient["planGeometry"];
};

function hasEnvironmentValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function createTeachingPlanner(): TeachingPlanner {
  const requested = process.env.VIDEO_PLANNER_PROVIDER?.trim().toLowerCase();
  if (requested === "mimo") return new MimoTeachingClient();
  if (requested === "qwen") return new QwenTeachingClient();
  if (requested && requested !== "auto") throw new Error("VIDEO_PLANNER_PROVIDER 只能是 qwen、mimo 或 auto");

  return hasEnvironmentValue("QWEN_API_KEY") || hasEnvironmentValue("DASHSCOPE_API_KEY")
    ? new QwenTeachingClient()
    : new MimoTeachingClient();
}
