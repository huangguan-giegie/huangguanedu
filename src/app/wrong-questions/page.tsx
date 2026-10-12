"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../components/api";
import { AuthGuard, type SafeUser } from "../../components/AuthGuard";
import { latexToUnicode } from "../../lib/latex-to-unicode";

interface WrongQuestionItem {
  id: string;
  studentId: string;
  studentName: string;
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  knowledgePoints: string[];
  mastered: boolean | null;
  status: string;
  isTeacherReviewed: boolean;
  isFavorite: boolean;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = { PROCESSING: "识别中", PENDING_STUDENT_CONFIRMATION: "待确认识别", PUBLISHED: "AI 初步生成", NEEDS_REVIEW: "待老师复核", REVIEWED: "老师已审核" };
const control = "rounded-xl border border-[#302a38]/15 bg-white px-3 py-2 text-sm";

function List() {
  const [items, setItems] = useState<WrongQuestionItem[]>([]);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [studentId, setStudentId] = useState("");
  const [ready, setReady] = useState(false);
  const [subject, setSubject] = useState("");
  const [mastered, setMastered] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [keyword, setKeyword] = useState("");
  const [onlyRecent, setOnlyRecent] = useState(true);
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const targetStudentId = new URLSearchParams(window.location.search).get("studentId") ?? "";
    void api.get<{ user: SafeUser }>("/api/v1/auth/me").then(({ user }) => { setStudentId(targetStudentId); setUser(user); setReady(true); }).catch((cause) => { setError(cause instanceof Error ? cause.message : "加载身份失败"); setLoading(false); });
  }, []);

  function filters() {
    const params = new URLSearchParams();
    if (studentId) params.set("studentId", studentId);
    if (subject) params.set("subject", subject);
    if (mastered) params.set("mastered", mastered);
    if (knowledgePoint.trim()) params.set("knowledgePoint", knowledgePoint.trim());
    if (onlyRecent) params.set("from", new Date(Date.now() - 90 * 24 * 3600000).toISOString());
    if (onlyFavorite) params.set("favorite", "true");
    return params;
  }

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (studentId) params.set("studentId", studentId);
      if (subject) params.set("subject", subject);
      if (mastered) params.set("mastered", mastered);
      if (knowledgePoint.trim()) params.set("knowledgePoint", knowledgePoint.trim());
      if (onlyRecent) params.set("from", new Date(Date.now() - 90 * 24 * 3600000).toISOString());
      if (onlyFavorite) params.set("favorite", "true");
      try {
        const data = await api.get<{ items: WrongQuestionItem[]; total: number }>(`/api/v1/wrong-questions?${params}`);
        if (!cancelled) { setItems(data.items); setTotal(data.total); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "错题加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [ready, studentId, subject, mastered, knowledgePoint, onlyRecent, onlyFavorite, page, refresh]);

  // 列表中有分析任务时自动更新，离开页面后停止。
  const hasProcessing = items.some((item) => item.status === "PROCESSING");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [hasProcessing]);

  async function toggleFavorite(item: WrongQuestionItem) {
    if (favoriteBusy) return;
    setFavoriteBusy(item.id);
    setError("");
    try {
      await api.post(`/api/v1/wrong-questions/${item.id}/favorite`, { favorite: !item.isFavorite });
      setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "收藏失败"); }
    finally { setFavoriteBusy(null); }
  }

  async function exportQuestions() {
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const data = await api.get<{ content: string; filename: string; count: number; total: number; truncated: boolean }>(`/api/v1/wrong-questions/export?${filters()}`);
      if (!data.count) { setMessage("当前筛选下没有可导出的错题"); return; }
      const url = URL.createObjectURL(new Blob([data.content], { type: "text/markdown;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(data.truncated ? `已导出前 ${data.count} 道错题（共 ${data.total} 道），可缩小筛选范围继续导出。` : `已导出 ${data.count} 道错题。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
    finally { setExporting(false); }
  }

  const practiceHref = studentId ? `/practice?studentId=${encodeURIComponent(studentId)}` : "/practice";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><span className="rounded-full bg-[#d7ef67] px-3 py-1 text-xs font-semibold">每一道错题，都是一次进步</span><h1 className="mt-3 text-2xl font-bold">{user?.role === "FAMILY" ? "我的错题本" : "学生错题本"}</h1><p className="mt-1 text-sm text-[#302a38]/60">收集、订正、再练习，让薄弱知识点逐个变成强项。</p></div>
        <div className="flex flex-wrap gap-3 text-sm">
          <button disabled={exporting || !ready} onClick={() => void exportQuestions()} className={`${control} disabled:opacity-50`}>{exporting ? "导出中…" : "导出错题"}</button>
          <Link href={practiceHref} className="rounded-xl border border-[#754be6]/25 bg-white px-4 py-2 font-semibold text-[#754be6]">生成模拟题 ↗</Link>
          {user?.role === "FAMILY" && <Link href="/wrong-questions/new" className="rounded-xl bg-[#754be6] px-4 py-2 font-semibold text-white">+ 上传错题</Link>}
        </div>
      </div>
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#302a38]/10 bg-white/70 p-4" aria-label="筛选错题">
        <label className="grid gap-1 text-xs text-[#302a38]/60">学科<select aria-label="学科" className={control} value={subject} onChange={(event) => { setSubject(event.target.value); setPage(1); }}><option value="">全部学科</option><option value="MATH">数学</option><option value="ENGLISH">英语</option></select></label>
        <label className="grid gap-1 text-xs text-[#302a38]/60">掌握情况<select aria-label="掌握情况" className={control} value={mastered} onChange={(event) => { setMastered(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="true">已理解</option><option value="false">仍不会</option></select></label>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setKnowledgePoint(keyword); setPage(1); }}><label className="grid gap-1 text-xs text-[#302a38]/60">知识点<input className={`${control} w-40`} placeholder="如：二次函数" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></label><button className={`${control} self-end`}>筛选</button></form>
        <button aria-pressed={onlyRecent} onClick={() => { setOnlyRecent((value) => !value); setPage(1); }} className={`${control} ${onlyRecent ? "text-[#754be6]" : ""}`}>{onlyRecent ? "近 90 天" : "全部时间"}</button>
        <button aria-pressed={onlyFavorite} onClick={() => { setOnlyFavorite((value) => !value); setPage(1); }} className={`${control} ${onlyFavorite ? "text-[#754be6]" : ""}`}>{onlyFavorite ? "★ 只看收藏" : "☆ 只看收藏"}</button>
        <span className="ml-auto self-center text-sm text-[#302a38]/50">共 {total} 道</span>
      </section>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-[#754be6]">{message}</p>}
      {loading && <p className="text-sm text-[#302a38]/60">正在更新错题…</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="flex items-start gap-4 rounded-2xl border border-[#302a38]/10 bg-white p-5 transition hover:border-[#754be6]/40">
            <Link href={`/wrong-questions/${item.id}`} className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[#302a38]/55"><span className="rounded-full bg-[#f3f0ff] px-2 py-1 font-semibold text-[#754be6]">{item.subject === "MATH" ? "数学" : "英语"}</span>{user?.role !== "FAMILY" && <span>{item.studentName}</span>}<span>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span></div>
              <p className="line-clamp-3 whitespace-pre-wrap break-words font-semibold leading-relaxed">{item.recognizedQuestion ? latexToUnicode(item.recognizedQuestion) : "题目正在识别，请稍候…"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-[#f3f0ff] px-2 py-1 text-[#754be6]">{STATUS_LABEL[item.status] ?? item.status}</span>{item.knowledgePoints.map((point) => <span key={point} className="rounded-md bg-[#f7f6fa] px-2 py-1">{point}</span>)}{item.mastered !== null && <span className={`rounded-md px-2 py-1 ${item.mastered ? "bg-[#d7ef67]/50" : "bg-orange-50 text-orange-700"}`}>{item.mastered ? "已理解" : "仍不会"}</span>}</div>
            </Link>
            <button aria-label={item.isFavorite ? "取消收藏" : "收藏错题"} aria-pressed={item.isFavorite} disabled={favoriteBusy !== null} onClick={() => void toggleFavorite(item)} className="px-1 text-2xl text-[#754be6] disabled:opacity-50">{item.isFavorite ? "★" : "☆"}</button>
          </article>
        ))}
        {!loading && !items.length && !error && <div className="rounded-2xl border border-dashed border-[#754be6]/25 bg-white/70 p-10 text-center"><p className="font-semibold">当前筛选下还没有错题</p><p className="mt-2 text-sm text-[#302a38]/60">调整筛选条件，或上传一道题开始订正。</p></div>}
      </div>
      {total > 20 && <nav aria-label="错题分页" className="flex items-center justify-center gap-4 text-sm"><button className={`${control} disabled:opacity-40`} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {page} / {Math.ceil(total / 20)} 页</span><button className={`${control} disabled:opacity-40`} disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((value) => value + 1)}>下一页</button></nav>}
    </div>
  );
}

export default function WrongQuestionsPage() { return <AuthGuard><List /></AuthGuard>; }
