// Mock 分析器：无 API Key 时默认使用，返回稳定结构化结果
import type { QuestionAnalysis } from "./schema";
import type { AnalyzeInput, QuestionAnalyzer } from "./types";

export class MockQuestionAnalyzer implements QuestionAnalyzer {
  async analyze(input: AnalyzeInput): Promise<QuestionAnalysis> {
    const subject = input.subject ?? "MATH";
    return {
      recognizedQuestion: "（示例）解方程：2x + 3 = 11，求 x 的值。",
      subject,
      questionType: "解方程",
      studentWorkDetected: false,
      studentWorkTranscription: null,
      studentApproach: null,
      firstErrorStep: null,
      misconception: null,
      whatStudentDidWell: null,
      thinkingHint: "先把常数项移到等号右边，再除以系数。",
      correctSteps: [
        "2x + 3 = 11",
        "2x = 11 - 3",
        "2x = 8",
        "x = 4",
      ],
      finalAnswer: "x = 4",
      errorCauses: ["移项时符号处理不当"],
      knowledgePoints: ["一元一次方程", "移项"],
      difficulty: "EASY",
      aiConfidence: 0.95,
      needsTeacherReview: false,
      reviewReasons: [],
      remedialPractice: ["练习 3x - 5 = 16", "练习 5x + 2 = 2x + 11"],
    };
  }
}
