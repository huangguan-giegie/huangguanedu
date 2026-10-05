"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../components/api";
import { AuthGuard, type SafeUser } from "../../components/AuthGuard";
import { MathAnswerInput } from "../../components/MathAnswerInput";
import { TutorPanel } from "../../components/TutorPanel";

interface LastAttempt {
  id: string;
  answer: string;
  result: "CORRECT" | "PARTIAL" | "INCORRECT";
  score: number;
  feedback: string | null;
  gradingMethod: string;
  attemptedAt: string;
}

interface PracticeQuestion {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  difficulty: string;
  knowledgePoints: unknown;
  lastAttempt: LastAttempt | null;
}

interface PracticeSetItem {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  mode: string;
  questions: PracticeQuestion[];
  createdAt: string;
}

interface StudentOption {
  id: string;
  name: string;
  grade: string;
}

function points(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function resultLabel(result: LastAttempt["result"]) {
  if (result === "CORRECT") return "正确";
  if (result === "PARTIAL") return "部分正确";
  return "需要复习";
}

function PracticeSets() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [items, setItems] = useState<PracticeSetItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadSets() {
    const data = await api.get<{ items: PracticeSetItem[] }>("/api/v1/practice-sets");
    setItems(data.items);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const { user: currentUser } = await api.get<{ user: SafeUser }>("/api/v1/auth/me");
        if (cancelled) return;
        setUser(currentUser);

        if (currentUser.role === "TEACHER") {
          const data = await api.get<{
            students: { student: { id: string; name: string; grade: string } }[];
          }>("/api/v1/teacher/students");
          if (!cancelled) {
            const options = data.students.map((item) => item.student);
            setStudents(options);
            setStudentId(options[0]?.id ?? "");
          }
        } else if (currentUser.role === "ADMIN") {
          const data = await api.get<{ students: StudentOption[] }>("/api/v1/admin/students?pageSize=100");
          if (!cancelled) {
            setStudents(data.students);
            setStudentId(data.students[0]?.id ?? "");
          }
        }
        await loadSets();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (!studentId || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/v1/practice-sets/generate", {
        studentId,
        count,
        difficulty,
      });
      await loadSets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(questionId: string) {
    const answer = (answers[questionId] ?? "").trim();
    if (!answer || submitting) return;
    setSubmitting(questionId);
    setError("");
    try {
      const result = await api.post<{ attempt: LastAttempt }>(
        `/api/v1/practice-questions/${questionId}/attempts`,
        { answer },
      );
      setItems((current) =>
        current.map((set) => ({
          ...set,
          questions: set.questions.map((question) =>
            question.id === questionId
              ? { ...question, lastAttempt: result.attempt }
              : question,
          ),
        })),
      );
      setAnswers((current) => ({ ...current, [questionId]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交答案失败");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">数学练习</h1>
          <p className="mt-1 text-sm text-[#1e2a3a]/60">
            根据错题和掌握度生成练习；答案由服务器判定并更新下一次复习时间。
          </p>
        </div>
        {user?.role === "FAMILY" && (
          <Link href="/review" className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white">
            今日复习计划
          </Link>
        )}
      </div>

      {user && user.role !== "FAMILY" && (
        <section className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
          <h2 className="font-semibold">生成新题组</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-[#1e2a3a]/60">学生</span>
              <select
                className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}（{student.grade}）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#1e2a3a]/60">题目数量</span>
              <select
                className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                <option value={3}>3 道</option>
                <option value={4}>4 道</option>
                <option value={5}>5 道</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#1e2a3a]/60">难度</span>
              <select
                className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
              >
                <option value="EASY">基础</option>
                <option value="MEDIUM">中等</option>
                <option value="HARD">较难</option>
              </select>
            </label>
            <button
              className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !studentId}
              onClick={() => void generate()}
            >
              {busy ? "生成中…" : "生成数学练习"}
            </button>
          </div>
        </section>
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {items.map((set) => (
          <section key={set.id} className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold">{set.title}</h2>
                <p className="mt-1 text-xs text-[#1e2a3a]/50">
                  {set.mode === "ADAPTIVE_REVIEW" ? "自适应复习" : set.mode === "SELECTED_WRONG_QUESTIONS" ? "选定错题变式" : "薄弱点专项"}
                </p>
              </div>
              <span className="text-xs text-[#1e2a3a]/50">
                {set.studentName} · {new Date(set.createdAt).toLocaleDateString()}
              </span>
            </div>
            <ol className="mt-4 space-y-4">
              {set.questions.map((question, index) => {
                const knowledgePoints = points(question.knowledgePoints);
                const attempt = question.lastAttempt;
                const familyMode = user?.role === "FAMILY";
                return (
                  <li key={question.id} className="rounded-lg bg-[#faf6ee] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{index + 1}. {question.question}</p>
                      <div className="flex flex-wrap gap-1 text-xs">
                        {knowledgePoints.map((point) => (
                          <span key={point} className="rounded bg-white px-2 py-0.5">{point}</span>
                        ))}
                        <span className="rounded bg-white px-2 py-0.5">
                          {question.difficulty === "EASY" ? "基础" : question.difficulty === "HARD" ? "较难" : "中等"}
                        </span>
                      </div>
                    </div>

                    {familyMode ? (
                      <div className="mt-3 space-y-3">
                        <MathAnswerInput
                          value={answers[question.id] ?? ""}
                          onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                          disabled={submitting === question.id}
                          placeholder="输入你的答案"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            className="rounded-lg bg-[#1e2a3a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={submitting === question.id || !(answers[question.id] ?? "").trim()}
                            onClick={() => void submitAnswer(question.id)}
                          >
                            {submitting === question.id ? "判题中…" : attempt ? "再次提交" : "提交答案"}
                          </button>
                          <TutorPanel practiceQuestionId={question.id} />
                        </div>
                        {attempt && (
                          <div className={`rounded-lg p-3 text-sm ${attempt.result === "CORRECT" ? "bg-green-50 text-green-800" : attempt.result === "PARTIAL" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
                            <div className="font-semibold">{resultLabel(attempt.result)} · {attempt.score} 分</div>
                            {attempt.feedback && <p className="mt-1">{attempt.feedback}</p>}
                            <p className="mt-1 text-xs opacity-70">
                              {attempt.gradingMethod === "AI" ? "AI 等价判题" : "规则判题"} · {new Date(attempt.attemptedAt).toLocaleString()}
                            </p>
                          </div>
                        )}
                        {attempt && (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-[#e8863a]">查看标准答案与解析</summary>
                            <p className="mt-2">答案：{question.answer}</p>
                            {question.explanation && <p className="mt-1 text-[#1e2a3a]/70">解析：{question.explanation}</p>}
                          </details>
                        )}
                      </div>
                    ) : (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-[#e8863a]">查看答案与解析</summary>
                        <p className="mt-2">答案：{question.answer}</p>
                        {question.explanation && <p className="mt-1 text-[#1e2a3a]/70">解析：{question.explanation}</p>}
                        {attempt && <p className="mt-2 text-[#1e2a3a]/60">学生最近一次：{resultLabel(attempt.result)} · {attempt.score} 分</p>}
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {items.length === 0 && !error && (
          <p className="text-sm text-[#1e2a3a]/50">暂无练习题组</p>
        )}
      </div>
    </div>
  );
}

export default function PracticeSetsPage() {
  return (
    <AuthGuard>
      <PracticeSets />
    </AuthGuard>
  );
}
