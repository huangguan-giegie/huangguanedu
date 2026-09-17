// 分析器工厂：QWEN_MODE=mock 使用 Mock；live 使用 Qwen（缺少配置时配置校验已报错）
import { loadConfig } from "../config";
import { MockQuestionAnalyzer } from "./mock";
import { QwenQuestionAnalyzer } from "./qwen";
import type { QuestionAnalyzer } from "./types";

export function getAnalyzer(): QuestionAnalyzer {
  const config = loadConfig();
  return config.qwen.mode === "live"
    ? new QwenQuestionAnalyzer()
    : new MockQuestionAnalyzer();
}

export { QuestionAnalysisSchema } from "./schema";
export type { QuestionAnalysis } from "./schema";
export type { AnalyzeInput, QuestionAnalyzer } from "./types";
