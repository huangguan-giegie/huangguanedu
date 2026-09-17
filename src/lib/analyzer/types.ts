// 分析器接口与输入类型
import type { QuestionAnalysis } from "./schema";

export interface AnalyzeInput {
  /** 图片的可访问 URL（生产为短期签名 URL；本地 live 测试为 oss:// 或 http(s) URL） */
  imageUrl?: string;
  mimeType: "image/jpeg" | "image/png";
  subject?: "MATH" | "ENGLISH";
}

export interface QuestionAnalyzer {
  analyze(input: AnalyzeInput): Promise<QuestionAnalysis>;
}
