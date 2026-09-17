import path from "node:path";
import { executeCourseBatch } from "../src/course-batch.js";

function requireValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`参数 ${name} 缺少值`);
  return value;
}

function optionalValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const args = process.argv.slice(2);
const cwd = path.resolve(import.meta.dirname, "..");
const sourceRoot = requireValue(args, "--source");
const courseId = optionalValue(args, "--course-id") ?? "math-review-course";
const voiceSamplePath = optionalValue(args, "--voice-sample");
const startId = optionalValue(args, "--start-id");
const limitText = optionalValue(args, "--limit");
const limit = limitText ? Number(limitText) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) throw new Error("--limit 必须是正整数");
const renderConcurrencyText = optionalValue(args, "--render-concurrency");
const renderConcurrency = renderConcurrencyText ? Number(renderConcurrencyText) : undefined;
if (renderConcurrency !== undefined && (!Number.isInteger(renderConcurrency) || renderConcurrency <= 0)) throw new Error("--render-concurrency 必须是正整数");

const result = await executeCourseBatch({
  cwd,
  sourceRoot,
  courseId,
  voiceSamplePath,
  renderManim: true,
  resume: args.includes("--resume"),
  startId,
  limit,
  renderConcurrency,
});

console.log(JSON.stringify({
  courseId: result.courseId,
  total: result.total,
  completed: result.completed,
  failed: result.failed,
  manifestPath: result.manifestPath,
  failures: result.results.filter((item) => item.status === "failed").map((item) => ({ id: item.lesson.id, error: item.error })),
}, null, 2));
