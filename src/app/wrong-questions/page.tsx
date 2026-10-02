"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";

interface WrongQuestionItem {
  id: string;
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  knowledgePoints: string[];
  mastered: boolean | null;
  status: string;
  isAiGenerated: boolean;
  isTeacherReviewed: boolean;
  isFavorite: boolean;
  updatedAt: string;
}

function List() {
  const [items, setItems] = useState<WrongQuestionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [mastered, setMastered] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [onlyRecent, setOnlyRecent] = useState(true);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const params = new URLSearchParams({ pageSize: "100" });
        if (subject) params.set("subject", subject);
        if (mastered) params.set("mastered", mastered);
        if (knowledgePoint.trim()) params.set("knowledgePoint", knowledgePoint.trim());
        if (onlyRecent) params.set("from", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
        const data = await api.get<{ items: WrongQuestionItem[] }>(`/api/v1/wrong-questions?${params}`);
        if (!cancelled) {
          setItems(data.items);
          setSelectedIds([]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [subject, mastered, knowledgePoint, onlyRecent]);

  async function toggleFavorite(item: WrongQuestionItem) {
    try {
      await api.post(`/api/v1/wrong-questions/${item.id}/favorite`, { favorite: !item.isFavorite });
      setItems((current) => current.map((question) => question.id === item.id ? { ...question, isFavorite: !item.isFavorite } : question));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "收藏操作失败");
    }
  }

  async function exportQuestions() {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (mastered) params.set("mastered", mastered);
      if (knowledgePoint.trim()) params.set("knowledgePoint", knowledgePoint.trim());
      if (onlyRecent) params.set("from", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      const result = await api.get<{ content: string; filename: string }>(
        `/api/v1/wrong-questions/export?${params.toString()}`,
      );
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/markdown;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function generatePractice() {
    if (!selectedIds.length || generating) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const result = await api.post<{ title: string }>("/api/v1/practice-sets/generate", {
        count: 5,
        wrongQuestionIds: selectedIds,
        difficulty,
      });
      setMessage(`已生成「${result.title}」。`);
      setSelectedIds([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "练习生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的错题本</h1>
        <div className="flex gap-4 text-sm">
          <button disabled={exporting} onClick={() => void exportQuestions()} className="text-[#1e2a3a]/70 hover:text-[#e8863a] disabled:opacity-50">{exporting ? "导出中…" : "导出错题"}</button>
          <Link href="/practice-sets" className="text-[#1e2a3a]/70 hover:text-[#e8863a]">数学练习</Link>
          <Link href="/wrong-questions/new" className="text-[#e8863a] hover:underline">+ 上传错题</Link>
        </div>
      </div>
      <div className="flex gap-3 text-sm">
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">全部学科</option>
          <option value="MATH">数学</option>
          <option value="ENGLISH">英语</option>
        </select>
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1"
          value={mastered}
          onChange={(e) => setMastered(e.target.value)}
        >
          <option value="">全部掌握状态</option>
          <option value="true">已理解</option>
          <option value="false">仍不会</option>
        </select>
        <input
          className="w-44 rounded-lg border border-[#1e2a3a]/20 px-3 py-1"
          placeholder="筛选知识点"
          value={knowledgePoint}
          onChange={(event) => setKnowledgePoint(event.target.value)}
        />
        <button onClick={() => setOnlyRecent((value) => !value)} className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1">
          {onlyRecent ? "近三个月" : "全部时间"}
        </button>
      </div>
      {message && <p className="rounded-lg bg-green-100 p-3 text-sm text-green-800">{message} <Link href="/practice-sets" className="font-semibold underline">查看练习</Link></p>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="flex items-start gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 hover:border-[#e8863a]"
          >
            <input
              type="checkbox"
              aria-label={`选择数学错题 ${item.id}`}
              checked={selectedIds.includes(item.id)}
              disabled={item.subject !== "MATH" || !["PUBLISHED", "REVIEWED"].includes(item.status) || (!selectedIds.includes(item.id) && selectedIds.length >= 20)}
              onChange={() => setSelectedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])}
              onClick={(event) => event.stopPropagation()}
              className="mt-1 h-4 w-4 accent-[#e8863a] disabled:opacity-30"
            />
            <Link href={`/wrong-questions/${item.id}`} className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                {item.recognizedQuestion ?? "（待识别）"}
                </span>
                <span className="text-xs text-[#1e2a3a]/50">
                {item.subject === "MATH" ? "数学" : "英语"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {item.knowledgePoints.map((p) => <span key={p} className="rounded bg-[#faf6ee] px-2 py-0.5">{p}</span>)}
                {item.status === "PROCESSING" && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">识别中</span>}
                {item.status === "PENDING_STUDENT_CONFIRMATION" && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">待确认</span>}
                {item.status === "NEEDS_REVIEW" && <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">待老师复核</span>}
                {item.isTeacherReviewed && <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">老师已审核</span>}
                {item.mastered !== null && <span className={`rounded px-2 py-0.5 ${item.mastered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.mastered ? "已理解" : "仍不会"}</span>}
              </div>
            </Link>
            <button onClick={() => void toggleFavorite(item)} aria-label={item.isFavorite ? "取消收藏" : "收藏"} className="text-xl text-[#e8863a]">{item.isFavorite ? "★" : "☆"}</button>
          </article>
        ))}
        {items.length === 0 && !error && (
          <p className="text-sm text-[#1e2a3a]/50">暂无错题</p>
        )}
      </div>
      {selectedIds.length > 0 && (
        <section className="sticky bottom-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 shadow-lg">
          <p className="mr-auto text-sm">已选 {selectedIds.length} 道数学错题</p>
          <label className="text-sm">
            <span className="mb-1 block text-[#1e2a3a]/60">练习难度</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)} className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2">
              <option value="EASY">基础</option><option value="MEDIUM">中等</option><option value="HARD">较难</option>
            </select>
          </label>
          <button disabled={generating} onClick={() => void generatePractice()} className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{generating ? "生成中…" : "生成针对性练习"}</button>
        </section>
      )}
    </div>
  );
}

export default function WrongQuestionsPage() {
  return (
    <AuthGuard>
      <List />
    </AuthGuard>
  );
}
