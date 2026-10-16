// 错题本导出：把错题记录生成为 Markdown 文本（纯函数，便于单元测试）
import type { WrongQuestion } from "../generated/prisma/client";

export interface ExportableWrongQuestion {
  id: string;
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
  firstSeenAt: Date;
  updatedAt: Date;
  knowledgePoints: string[];
}

export interface ExportOptions {
  subject?: "MATH" | "ENGLISH";
  from?: string;
  items: ExportableWrongQuestion[];
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return [];
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSection(label: string, lines: string[] | string | null | undefined): string {
  if (lines == null) return "";
  const items = Array.isArray(lines) ? lines : [String(lines)];
  const nonEmpty = items.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "";
  return `**${label}**：\n${nonEmpty.map((s) => (nonEmpty.length > 1 ? `- ${s}` : `${s}`)).join("\n")}\n`;
}

/** 生成错题本导出的 Markdown 文本 */
export function buildWrongQuestionsMarkdown(options: ExportOptions): string {
  const { items } = options;
  const subjectLabel =
    options.subject === "MATH" ? "数学" : options.subject === "ENGLISH" ? "英语" : "全部学科";
  const rangeLabel = options.from ? "近三个月" : "全部时间";
  const header: string[] = [
    "# 错题本导出",
    `> 导出时间：${formatDate(new Date())}`,
    `> 共 ${items.length} 道错题`,
    `> 筛选：${subjectLabel} · ${rangeLabel}`,
  ];
  const body: string[] = [];
  items.forEach((item, index) => {
    const subject = item.subject === "MATH" ? "数学" : "英语";
    const mastered = item.mastered === null ? "未标记" : item.mastered ? "已理解" : "待复习";
    const statusText =
      item.status === "PROCESSING"
        ? "识别中"
        : item.status === "PENDING_STUDENT_CONFIRMATION"
          ? "待确认"
          : item.status === "NEEDS_REVIEW"
            ? "待老师复核"
          : item.isTeacherReviewed
            ? "老师已审核"
            : "已发布";
    const sections: string[] = [
      `## 第 ${index + 1} 题 · ${subject}`,
      `> 状态：${statusText} · 掌握：${mastered} · 记录时间：${formatDate(item.updatedAt)}`,
      "",
      `**知识点**：${item.knowledgePoints.join("、") || "暂无"}`,
      "",
      `**题目**：\n${item.recognizedQuestion ?? "（题目识别中）"}`,
      "",
    ];
    if (item.questionType) {
      sections.push(`**题型**：${item.questionType}\n`);
    }
    const steps = stringArray(item.correctSteps);
    if (steps.length > 0) {
      sections.push(formatSection("完整解答", steps.map((s, i) => `${i + 1}. ${s}`)));
    }
    if (item.finalAnswer) {
      sections.push(`**最终答案**：\n${item.finalAnswer}\n`);
    }
    const causes = stringArray(item.errorCauses);
    if (causes.length > 0) {
      sections.push(formatSection("错误原因", causes));
    }
    if (item.thinkingHint) {
      sections.push(`**思路讲解**：\n${item.thinkingHint}\n`);
    }
    const remedial = stringArray(item.remedialPractice);
    if (remedial.length > 0) {
      sections.push(formatSection("针对性练习建议", remedial));
    }
    if (item.teacherNote) {
      sections.push(`**老师批注**：\n${item.teacherNote}\n`);
    }
    body.push(sections.join("\n").trimEnd());
  });

  return `${header.join("\n")}\n\n---\n\n${body.join("\n\n---\n\n")}\n`;
}

/** 从 Prisma 查询结果转换为导出用结构 */
export function toExportableWrongQuestion(
  wq: WrongQuestion & {
    knowledgePointRecords?: Array<{ knowledgePoint: string }>;
  },
): ExportableWrongQuestion {
  return {
    id: wq.id,
    subject: wq.subject,
    recognizedQuestion: wq.recognizedQuestion,
    questionType: wq.questionType,
    finalAnswer: wq.finalAnswer,
    correctSteps: wq.correctSteps,
    errorCauses: wq.errorCauses,
    thinkingHint: wq.thinkingHint,
    remedialPractice: wq.remedialPractice,
    mastered: wq.mastered,
    status: wq.status,
    isTeacherReviewed: wq.isTeacherReviewed,
    teacherNote: wq.teacherNote,
    firstSeenAt: wq.firstSeenAt,
    updatedAt: wq.updatedAt,
    knowledgePoints: (wq.knowledgePointRecords ?? []).map((r) => r.knowledgePoint),
  };
}

/** 生成导出文件名（ASCII，避免中文编码问题） */
export function buildExportFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `wrong-questions-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.md`;
}
