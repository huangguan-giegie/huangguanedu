import type { WrongQuestion } from "../generated/prisma/client";

export interface ExportableWrongQuestion {
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  questionType: string | null;
  finalAnswer: string | null;
  correctSteps: unknown;
  errorCauses: unknown;
  thinkingHint: string | null;
  remedialPractice: unknown;
  mastered: boolean | null;
  status: string;
  isTeacherReviewed: boolean;
  teacherNote: string | null;
  updatedAt: Date;
  knowledgePoints: string[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

export function buildWrongQuestionsMarkdown(options: {
  items: ExportableWrongQuestion[];
  subject?: "MATH" | "ENGLISH";
}): string {
  const subject = options.subject === "MATH" ? "数学" : options.subject === "ENGLISH" ? "英语" : "全部学科";
  const sections = options.items.map((item, index) => {
    const status = item.isTeacherReviewed ? "老师已审核" : item.status === "PROCESSING" ? "识别中" : "已发布";
    const lines = [
      `## ${index + 1}. ${item.subject === "MATH" ? "数学" : "英语"}错题`,
      `记录时间：${formatDate(item.updatedAt)} · ${status} · ${item.mastered === true ? "已理解" : item.mastered === false ? "待复习" : "未标记"}`,
      `知识点：${item.knowledgePoints.join("、") || "暂无"}`,
      "",
      `题目：${item.recognizedQuestion ?? "题目识别中"}`,
    ];
    const steps = stringArray(item.correctSteps);
    if (steps.length) lines.push("", "解题步骤：", ...steps.map((step, i) => `${i + 1}. ${step}`));
    if (item.finalAnswer) lines.push("", `答案：${item.finalAnswer}`);
    const causes = stringArray(item.errorCauses);
    if (causes.length) lines.push("", "错误原因：", ...causes.map((cause) => `- ${cause}`));
    if (item.thinkingHint) lines.push("", `思路提示：${item.thinkingHint}`);
    const practice = stringArray(item.remedialPractice);
    if (practice.length) lines.push("", "补救练习：", ...practice.map((question) => `- ${question}`));
    if (item.teacherNote) lines.push("", `老师批注：${item.teacherNote}`);
    return lines.join("\n");
  });

  return [`# 错题本（${subject}）`, `导出时间：${formatDate(new Date())}`, `共 ${options.items.length} 道`, "", ...sections].join("\n\n");
}

export function toExportableWrongQuestion(
  item: WrongQuestion & { knowledgePointRecords: Array<{ knowledgePoint: string }> },
): ExportableWrongQuestion {
  return {
    subject: item.subject,
    recognizedQuestion: item.recognizedQuestion,
    questionType: item.questionType,
    finalAnswer: item.finalAnswer,
    correctSteps: item.correctSteps,
    errorCauses: item.errorCauses,
    thinkingHint: item.thinkingHint,
    remedialPractice: item.remedialPractice,
    mastered: item.mastered,
    status: item.status,
    isTeacherReviewed: item.isTeacherReviewed,
    teacherNote: item.teacherNote,
    updatedAt: item.updatedAt,
    knowledgePoints: item.knowledgePointRecords.map((record) => record.knowledgePoint),
  };
}

export function buildExportFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `wrong-questions-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.md`;
}
