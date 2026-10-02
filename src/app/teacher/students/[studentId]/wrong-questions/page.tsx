"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../../../../components/api";
import { AuthGuard } from "../../../../../components/AuthGuard";

interface WrongQuestionItem {
  id: string;
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  knowledgePoints: string[];
  mastered: boolean | null;
  isTeacherReviewed: boolean;
  isFavorite: boolean;
  updatedAt: string;
}

interface StudentQuestionsData {
  student: { id: string; name: string; grade: string };
  items: WrongQuestionItem[];
}

function StudentWrongQuestions({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  const [data, setData] = useState<StudentQuestionsData | null>(null);
  const [subject, setSubject] = useState<"MATH" | "ENGLISH" | "">("MATH");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    api.get<StudentQuestionsData>(
      `/api/v1/teacher/students/${studentId}/wrong-questions?${params.toString()}`,
    ).then((result) => {
      if (!cancelled) {
        setData(result);
        setSelectedIds([]);
        setError("");
        setLoading(false);
      }
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "错题加载失败");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, subject]);

  function toggle(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }

  async function toggleFavorite(item: WrongQuestionItem) {
    setError("");
    try {
      await api.post(`/api/v1/wrong-questions/${item.id}/favorite`, { favorite: !item.isFavorite });
      setData((current) => current ? {
        ...current,
        items: current.items.map((question) => question.id === item.id ? { ...question, isFavorite: !item.isFavorite } : question),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "收藏操作失败");
    }
  }

  async function generate() {
    if (!data || selectedIds.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.post<{ title: string }>("/api/v1/practice-sets/generate", {
        studentId,
        count: 5,
        wrongQuestionIds: selectedIds,
        difficulty,
      });
      setMessage(`已为 ${data.student.name} 生成「${result.title}」。`);
      setSelectedIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模拟题生成失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/teacher/students" className="text-sm text-[#e8863a] hover:underline">← 返回我的学生</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data?.student.name ?? "学生"}的错题本</h1>
          {data?.student.grade && <p className="mt-1 text-sm text-[#1e2a3a]/60">{data.student.grade}</p>}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-[#1e2a3a]/60">学科</span>
          <select value={subject} onChange={(event) => { setLoading(true); setSubject(event.target.value as typeof subject); }} className="rounded-lg border border-[#1e2a3a]/20 bg-white px-3 py-2">
            <option value="MATH">数学</option>
            <option value="ENGLISH">英语</option>
            <option value="">全部学科</option>
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="rounded-lg bg-green-100 p-3 text-sm text-green-800">{message} <Link href="/practice-sets" className="font-semibold underline">查看练习</Link></p>}
      {loading ? <p className="text-sm text-[#1e2a3a]/50">正在加载错题…</p> : data?.items.length === 0 ? <p className="text-sm text-[#1e2a3a]/50">暂无错题</p> : (
        <div className="space-y-3">
          {data?.items.map((item) => (
            <article key={item.id} className="flex items-start gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
              <input
                aria-label={`选择错题 ${item.id}`}
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                disabled={item.subject !== "MATH" || (!selectedIds.includes(item.id) && selectedIds.length >= 20)}
                onChange={() => toggle(item.id)}
                className="mt-1 h-4 w-4 accent-[#e8863a]"
              />
              <div className="min-w-0 flex-1">
                <Link href={`/wrong-questions/${item.id}`} className="font-medium hover:text-[#e8863a]">
                  {item.recognizedQuestion ?? "题目识别中"}
                </Link>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#1e2a3a]/60">
                  <span>{item.subject === "MATH" ? "数学" : "英语"}</span>
                  {item.knowledgePoints.map((point) => <span key={point} className="rounded bg-[#faf6ee] px-2 py-0.5">{point}</span>)}
                  {item.isTeacherReviewed && <span className="text-green-700">老师已审核</span>}
                </div>
                {item.subject !== "MATH" && <p className="mt-2 text-xs text-[#1e2a3a]/50">模拟题生成目前使用数学错题。</p>}
              </div>
              <button onClick={() => void toggleFavorite(item)} className="text-lg text-[#e8863a]" aria-label={item.isFavorite ? "取消收藏" : "收藏"}>{item.isFavorite ? "★" : "☆"}</button>
            </article>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <section className="sticky bottom-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 shadow-lg">
          <p className="mr-auto text-sm">已选 {selectedIds.length} 道数学错题</p>
          <label className="text-sm">
            <span className="mb-1 block text-[#1e2a3a]/60">练习难度</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)} className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2">
              <option value="EASY">基础</option><option value="MEDIUM">中等</option><option value="HARD">较难</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => void generate()} className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "生成中…" : "生成针对性练习"}</button>
        </section>
      )}
    </div>
  );
}

export default function TeacherStudentWrongQuestionsPage({ params }: { params: Promise<{ studentId: string }> }) {
  return <AuthGuard><StudentWrongQuestions params={params} /></AuthGuard>;
}
