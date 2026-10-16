import type { PracticeDiagram } from "../lib/practice-diagram";
import { latexToUnicode } from "../lib/latex-to-unicode";

export interface PracticeQuestion {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  imageUrl?: string | null;
  diagram?: PracticeDiagram | null;
}

export interface PracticeSetItem {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  // 决定作答区用公式键盘还是普通输入框。详情接口会经来源错题反查，
  // 列表接口不返回该字段（默认按 MATH 处理）。
  subject?: "MATH" | "ENGLISH";
  questions: PracticeQuestion[];
  createdAt: string;
}

export interface PracticeGenerationTask {
  jobId: string;
  studentId: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  error: string | null;
  practiceSetId: string | null;
}

export function isPracticeGenerating(task: PracticeGenerationTask | null): boolean {
  return task?.status === "PENDING" || task?.status === "PROCESSING";
}

export function togglePracticeSource(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((value) => value !== id);
  return ids.length < 20 ? [...ids, id] : ids;
}

export function practiceText(set: PracticeSetItem, withAnswers: boolean): string {
  return [
    set.title,
    `${set.studentName} · ${set.questions.length} 道题`,
    ...set.questions.map((question, index) => [
      `\n第 ${index + 1} 题`,
      latexToUnicode(question.question),
      ...(withAnswers ? [
        `答案：${latexToUnicode(question.answer)}`,
        ...(question.explanation ? [`解析：${latexToUnicode(question.explanation)}`] : []),
      ] : []),
    ].join("\n")),
  ].join("\n");
}
