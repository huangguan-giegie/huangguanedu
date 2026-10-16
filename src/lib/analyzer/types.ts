// 分析器接口与输入类型
import type { QuestionAnalysis } from "./schema";

export interface AnalyzeInput {
  /** 图片的可访问 URL（生产为短期签名 URL；本地 live 测试为 oss:// 或 http(s) URL） */
  imageUrl?: string;
  /** 多图模式：多张图片 URL（英语阅读长文等场景），按顺序传给模型 */
  imageUrls?: string[];
  mimeType: "image/jpeg" | "image/png";
  subject?: "MATH" | "ENGLISH";
  /** 本次分析使用的视觉模型（qwen-vl-max / qwen-vl-plus），缺省用全局默认 */
  model?: string;
}

export interface QuestionAnalyzer {
  analyze(input: AnalyzeInput): Promise<QuestionAnalysis>;
}
