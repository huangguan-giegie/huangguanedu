import type { TeachingPromptInput } from "./types.js";

export function buildTeachingPrompt(input: TeachingPromptInput): string {
  const target = input.targetDurationSeconds ?? 120;
  const images = input.images?.length ? `\n附带题图：${input.images.join("、")}` : "";
  return [
    "你是武汉市中考数学课程的教学设计师，只输出可解析的 JSON，不要 Markdown。",
    `视频标题：${input.title}`,
    `教案或题目内容：${input.text}${images}`,
    `目标时长约 ${target} 秒，允许范围为 90-195 秒；中文旁白按每秒约 5 个字准备，总旁白约 ${Math.round(target * 5)} 字；不要用空话凑时长。`,
    "先找出教案的核心知识点；如果有定理或原理，必须写出完整证明：成立条件、构造、逐步推理和结论。",
    "如果有例题，必须输出主解法和替代解法；每种解法都要写出题干触发信息、解题思路、逐步推导和结论，并明确两种思路的差异。",
    "表达要精简、中心明确：先用一个有趣问题吸引学生，再讲直觉、证明、例题、易错点和总结；不要堆砌重复解释。",
    "所有可见文字、旁白和字幕必须使用自然中文；公式请保留清晰的逐步变形。",
    "返回字段：hook、intuition、proof（可选）、solutions、mistakes、summary、cta（可选）。",
  ].join("\n");
}
