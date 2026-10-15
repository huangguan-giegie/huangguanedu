"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../components/api";
import { AuthGuard, type SafeUser } from "../../components/AuthGuard";
import { Icon } from "../../components/icons";
import { StatusTag } from "../../components/StatusTag";
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

// 状态文案统一走 @/lib/wrong-question-status 的 statusMeta，不在本页写本地常量
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
        <div><span className="chip">每一道错题，都是一次进步</span><h1 className="mt-3 text-2xl font-bold">{user?.role === "FAMILY" ? "我的错题本" : "学生错题本"}</h1><p className="lede mt-1 text-sm text-[#302a38]/60">收集、订正、再练习，让薄弱知识点逐个变成强项。</p></div>
        <div className="flex flex-wrap gap-3 text-sm">
          <button disabled={exporting || !ready} aria-busy={exporting} onClick={() => void exportQuestions()} className={`${control} disabled:opacity-50`}><Icon name="download" size={16} /> {exporting ? "导出中…" : "导出错题"}</button>
          <Link href={practiceHref} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#754be6]/25 bg-white px-4 py-2 font-semibold text-[#754be6]">生成模拟题 <Icon name="arrow-right" size={16} /></Link>
          {user?.role === "FAMILY" && <Link href="/wrong-questions/new" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#754be6] px-4 py-2 font-semibold text-white"><Icon name="plus" size={16} /> 上传错题</Link>}
        </div>
      </div>
      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#302a38]/10 bg-white/70 p-4" aria-label="筛选错题">
        <label className="grid gap-1 text-xs text-[#302a38]/60">学科<select aria-label="学科" className={control} value={subject} onChange={(event) => { setSubject(event.target.value); setPage(1); }}><option value="">全部学科</option><option value="MATH">数学</option><option value="ENGLISH">英语</option></select></label>
        <label className="grid gap-1 text-xs text-[#302a38]/60">掌握情况<select aria-label="掌握情况" className={control} value={mastered} onChange={(event) => { setMastered(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="true">已理解</option><option value="false">仍不会</option></select></label>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setKnowledgePoint(keyword); setPage(1); }}><label className="grid gap-1 text-xs text-[#302a38]/60">知识点<input className={`${control} w-40`} placeholder="如：二次函数" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></label><button className={`${control} self-end`}>筛选</button></form>
        <button aria-pressed={onlyRecent} onClick={() => { setOnlyRecent((value) => !value); setPage(1); }} className={`${control} ${onlyRecent ? "text-[#754be6]" : ""}`}>{onlyRecent ? "近 90 天" : "全部时间"}</button>
        <button aria-pressed={onlyFavorite} onClick={() => { setOnlyFavorite((value) => !value); setPage(1); }} className={`${control} ${onlyFavorite ? "text-[#754be6]" : ""}`}><Icon name={onlyFavorite ? "star-filled" : "star"} size={16} /> 只看收藏</button>
        {/* 结果数量变化必须播报：用户点了"筛选"后不知道结果变了 */}
        <span className="page-count ml-auto self-center text-sm text-[#302a38]/50" role="status" aria-live="polite">
          {loading ? "正在加载" : `共 ${total} 道`}
        </span>
      </section>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-[#754be6]">{message}</p>}
      {loading && <p className="page-loading">正在更新错题…</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="flex items-start gap-4 rounded-2xl border border-[#302a38]/10 bg-white p-5 transition hover:border-[#754be6]/40">
            <Link href={`/wrong-questions/${item.id}`} className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[#302a38]/55"><span className="chip">{item.subject === "MATH" ? "数学" : "英语"}</span>{user?.role !== "FAMILY" && <span>{item.studentName}</span>}<span>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span></div>
              <p className="line-clamp-3 whitespace-pre-wrap break-words font-semibold leading-relaxed">{item.recognizedQuestion ? latexToUnicode(item.recognizedQuestion) : "题目正在识别，请稍候…"}</p>
              {/* 学科标签用 status-tag 的 primary 变体，知识点是无语义 chip，
                  掌握情况是语义态（已理解=success / 仍不会=warning）。
                  原先三者都是散装 rounded-md + 硬编码色，5 个状态还共用一个紫 badge。 */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <StatusTag status={item.status} />
                {item.knowledgePoints.map((point) => <span key={point} className="chip">{point}</span>)}
                {item.mastered !== null && (
                  <span className={`status-tag status-tag--${item.mastered ? "success" : "warning"}`}>
                    <span className="status-tag__dot" aria-hidden="true" />
                    {item.mastered ? "已理解" : "仍不会"}
                  </span>
                )}
              </div>
            </Link>
            {/* 收藏按钮原为 px-1 + text-2xl 的 ★/☆ 字符，实际触控高仅约 32px。
                换成 SVG 图标 + 44px 命中区。aria-pressed 已表达状态。 */}
            <button
              aria-label={item.isFavorite ? `取消收藏「${item.recognizedQuestion?.slice(0, 20) ?? "这道错题"}」` : "收藏错题"}
              aria-pressed={item.isFavorite}
              disabled={favoriteBusy !== null}
              onClick={() => void toggleFavorite(item)}
              className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg text-[#754be6] transition hover:bg-[#f3f0ff] disabled:opacity-50"
            >
              <Icon name={item.isFavorite ? "star-filled" : "star"} size={22} />
            </button>
          </article>
        ))}
        {!loading && !items.length && !error && <div className="rounded-2xl border border-dashed border-[#754be6]/25 bg-white/70 p-10 text-center"><p className="font-semibold">当前筛选下还没有错题</p><p className="mt-2 text-sm text-[#302a38]/60">调整筛选条件，或上传一道题开始订正。</p></div>}
      </div>
      {/* 分页换页后必须播报，否则读屏用户不知道内容变了 */}
      {total > 20 && (
        <nav aria-label="错题分页" className="flex items-center justify-center gap-4 text-sm">
          <button className={`${control} disabled:opacity-40`} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</button>
          <span role="status" aria-live="polite">第 {page} / {Math.ceil(total / 20)} 页</span>
          <button className={`${control} disabled:opacity-40`} disabled={page >= Math.ceil(total / 20) || loading} onClick={() => setPage((value) => value + 1)}>下一页</button>
        </nav>
      )}
    </div>
  );
}

export default function WrongQuestionsPage() { return <AuthGuard><List /></AuthGuard>; }
