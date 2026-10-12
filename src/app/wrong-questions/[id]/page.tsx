"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { api } from "../../../components/api";
import { AuthGuard, type SafeUser } from "../../../components/AuthGuard";
import { latexToUnicode } from "../../../lib/latex-to-unicode";

interface WrongQuestion {
  id: string;
  studentId: string;
  studentName: string;
  status: string;
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  thinkingHint: string | null;
  aiConfidence: number | null;
  errorCauses: string[] | null;
  knowledgePoints: string[];
  correctSteps: string[] | null;
  finalAnswer: string | null;
  remedialPractice: string[] | null;
  isAiGenerated: boolean;
  isTeacherReviewed: boolean;
  studentWorkTranscription: string | null;
  studentApproach: string | null;
  firstErrorStep: string | null;
  misconception: string | null;
  teacherNote: string | null;
  errorType: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | "UNKNOWN";
  mastered: boolean | null;
  isFavorite: boolean;
  imageUrls: string[];
  attempts: Array<{ id: string; answer: string; result: "CORRECT" | "PARTIAL" | "INCORRECT"; attemptedAt: string }>;
}

type ReviewDraft = { recognizedQuestion: string; finalAnswer: string; correctSteps: string; thinkingHint: string; errorCauses: string; knowledgePoints: string; remedialPractice: string; teacherNote: string; errorType: string; difficulty: WrongQuestion["difficulty"] };
const blankDraft: ReviewDraft = { recognizedQuestion: "", finalAnswer: "", correctSteps: "", thinkingHint: "", errorCauses: "", knowledgePoints: "", remedialPractice: "", teacherNote: "", errorType: "", difficulty: "UNKNOWN" };
const panel = "rounded-2xl border border-[#302a38]/10 bg-white p-5 sm:p-6";
const button = "rounded-xl border border-[#302a38]/15 bg-white px-4 py-2 text-sm disabled:opacity-40";
const primary = "rounded-xl bg-[#754be6] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40";
const statusLabels: Record<string, string> = { PROCESSING: "AI 分析中", PENDING_STUDENT_CONFIRMATION: "待确认识别", PUBLISHED: "AI 初步生成", NEEDS_REVIEW: "待老师复核", REVIEWED: "老师已审核" };
const attemptLabels = { CORRECT: "答对了", PARTIAL: "部分正确", INCORRECT: "仍有错误" };
function lines(value: string): string[] { return [...new Set(value.split("\n").map((line) => line.trim()).filter(Boolean))]; }
function text(value: string | null | undefined): string { return value ? latexToUnicode(value) : "暂无内容"; }
function draftOf(w: WrongQuestion): ReviewDraft {
  return { recognizedQuestion: w.recognizedQuestion ?? "", finalAnswer: w.finalAnswer ?? "", correctSteps: (w.correctSteps ?? []).join("\n"), thinkingHint: w.thinkingHint ?? "", errorCauses: (w.errorCauses ?? []).join("\n"), knowledgePoints: w.knowledgePoints.join("\n"), remedialPractice: (w.remedialPractice ?? []).join("\n"), teacherNote: w.teacherNote ?? "", errorType: w.errorType ?? "", difficulty: w.difficulty };
}

function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [w, setQuestion] = useState<WrongQuestion | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft>(blankDraft);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"CORRECT" | "PARTIAL" | "INCORRECT">("CORRECT");
  const [candidates, setCandidates] = useState<Array<{ id: string; subject: string; status: string; recognizedQuestion: string | null }>>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [targetId, setTargetId] = useState("");

  async function load() {
    const data = await api.get<{ wrongQuestion: WrongQuestion }>(`/api/v1/wrong-questions/${id}`);
    setQuestion(data.wrongQuestion);
    setDraft(draftOf(data.wrongQuestion));
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void api.get<{ user: SafeUser }>("/api/v1/auth/me").then(({ user }) => { if (!cancelled) setUser(user); }).catch(() => undefined);
    async function poll() {
      try {
        const data = await api.get<{ wrongQuestion: WrongQuestion }>(`/api/v1/wrong-questions/${id}`);
        if (cancelled) return;
        setQuestion(data.wrongQuestion);
        setDraft(draftOf(data.wrongQuestion));
        setError("");
        if (data.wrongQuestion.status === "PROCESSING") timer = setTimeout(() => void poll(), 3000);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败"); }
    }
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id]);

  async function act(operation: () => Promise<void>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try { await operation(); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(latexToUnicode(value)); setMessage("已复制，公式已转换为可读文字"); }
    catch { setError("复制失败，请检查浏览器剪贴板权限"); }
  }

  async function openMerge() {
    if (!w) return;
    await act(async () => {
      const data = await api.get<{ items: typeof candidates }>(`/api/v1/wrong-questions?studentId=${encodeURIComponent(w.studentId)}&subject=${w.subject}&pageSize=100`);
      setCandidates(data.items.filter((item) => item.id !== id && item.status !== "PROCESSING"));
      setTargetId("");
      setMergeOpen(true);
    });
  }

  if (!w) return <p className={error ? "text-sm text-red-700" : "text-sm text-[#302a38]/60"}>{error || "正在打开错题…"}</p>;
  const isFamily = user?.role === "FAMILY";
  const canReview = user?.role === "TEACHER" || user?.role === "ADMIN";
  const published = ["PUBLISHED", "REVIEWED"].includes(w.status);
  const backHref = isFamily ? "/wrong-questions" : `/wrong-questions?studentId=${encodeURIComponent(w.studentId)}`;
  const practiceHref = `/practice?studentId=${encodeURIComponent(w.studentId)}&wrongQuestionId=${encodeURIComponent(id)}&subject=${w.subject}`;
  const copyAll = [w.recognizedQuestion, w.thinkingHint, ...(w.errorCauses ?? []), ...(w.correctSteps ?? []), w.finalAnswer, w.teacherNote].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm text-[#754be6]">← 返回错题本</Link>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{w.subject === "MATH" ? "数学" : "英语"}错题详情</h1><div className="mt-2 flex items-center gap-3 text-sm"><span className="rounded-full bg-[#e9e2ff] px-3 py-1 text-[#754be6]">{statusLabels[w.status] ?? w.status}</span>{typeof w.aiConfidence === "number" && <span className="text-[#302a38]/60">AI 识别置信度 {Math.round(w.aiConfidence * 100)}%</span>}{!isFamily && <span className="text-[#302a38]/60">{w.studentName}</span>}</div></div><div className="flex flex-wrap gap-2"><button disabled={busy} aria-pressed={w.isFavorite} onClick={() => void act(async () => { const favorite = !w.isFavorite; await api.post(`/api/v1/wrong-questions/${id}/favorite`, { favorite }); setQuestion({ ...w, isFavorite: favorite }); })} className={`${button} text-[#754be6]`}>{w.isFavorite ? "★ 已收藏" : "☆ 收藏错题"}</button>{published && <Link href={practiceHref} className={primary}>生成同类练习 ↗</Link>}</div></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-[#d7ef67]/30 p-3 text-sm">{message}</p>}
      {w.imageUrls.length > 0 && <section className={panel}><h2 className="font-semibold">题目原图</h2><p className="mt-1 text-xs text-[#302a38]/50">点击放大查看题干、图形和作答过程。</p><div className="mt-3 flex flex-wrap gap-3">{w.imageUrls.map((url, index) => <button key={url} aria-label={`查看第 ${index + 1} 张原图`} onClick={() => setActiveImage(url)} className="rounded-xl border border-[#302a38]/10 p-2"><NextImage src={url} alt={`第 ${index + 1} 张题目原图`} width={320} height={240} unoptimized className="h-40 w-56 object-contain" /></button>)}</div></section>}
      {w.status === "PROCESSING" ? <section className={panel}><p className="font-semibold text-[#754be6]">正在识别题目与学生过程…</p><p className="mt-2 text-sm text-[#302a38]/60">本页会自动更新，你也可以返回错题本继续上传。</p></section> : <>
        <section className={panel}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">01 · 题目与思路</h2>{w.recognizedQuestion && <button onClick={() => void copy(w.recognizedQuestion!)} className="text-xs text-[#754be6]">复制题目</button>}</div><p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">{text(w.recognizedQuestion)}</p>{w.studentWorkTranscription && <div className="mt-4 border-l-2 border-[#d7ef67] pl-3 text-sm"><p className="mb-1 font-semibold">学生作答过程</p><p className="whitespace-pre-wrap">{text(w.studentWorkTranscription)}</p></div>}{w.studentApproach && <p className="mt-3 whitespace-pre-wrap text-sm text-[#302a38]/70">解题思路：{text(w.studentApproach)}</p>}{w.thinkingHint && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-[#f3f0ff] p-4 text-sm leading-relaxed"><b>思路提示：</b>{text(w.thinkingHint)}<button onClick={() => void copy(w.thinkingHint!)} className="mt-3 block text-xs text-[#754be6]">复制思路</button></p>}</section>
        <section className={panel}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">02 · 找到薄弱点</h2>{w.errorCauses?.length ? <button onClick={() => void copy(w.errorCauses!.join("\n"))} className="text-xs text-[#754be6]">复制错误原因</button> : null}</div>{w.firstErrorStep && <p className="mt-3 whitespace-pre-wrap text-sm">首个错误步骤：{text(w.firstErrorStep)}</p>}{w.misconception && <p className="mt-2 whitespace-pre-wrap text-sm">错误概念：{text(w.misconception)}</p>}<ul className="mt-3 list-inside list-disc space-y-2 text-sm">{(w.errorCauses ?? []).map((cause, index) => <li key={index}>{text(cause)}</li>)}</ul><div className="mt-4 flex flex-wrap gap-2">{w.knowledgePoints.map((point) => <span key={point} className="rounded-full bg-[#e9e2ff] px-3 py-1 text-xs text-[#754be6]">{point}</span>)}</div></section>
        <section className={panel}><div className="flex items-center justify-between"><h2 className="font-semibold">03 · 完整解答</h2>{(published || canReview) && <button onClick={() => void copy(copyAll)} className="text-xs text-[#754be6]">复制完整解析</button>}</div>{!published && !canReview ? <div className="mt-4 space-y-3"><p className="text-sm text-[#302a38]/70">{w.status === "NEEDS_REVIEW" ? "已提交老师复核，审核后可查看完整解析。" : "先核对题目和作答过程的识别结果，再查看完整解析。"}</p>{isFamily && w.status === "PENDING_STUDENT_CONFIRMATION" && <div className="flex flex-wrap gap-3"><button disabled={busy} className={primary} onClick={() => void act(async () => { await api.post(`/api/v1/wrong-questions/${id}/feedback`, { feedback: "ACCURATE" }); await load(); }, "已确认识别结果")}>识别准确，查看解析</button><button disabled={busy} className={button} onClick={() => void act(async () => { await api.post(`/api/v1/wrong-questions/${id}/feedback`, { feedback: "NEEDS_REVIEW" }); await load(); }, "已提交老师复核")}>需要老师复核</button></div>}</div> : <>{w.correctSteps?.length ? <button onClick={() => void copy(w.correctSteps!.join("\n"))} className="mt-4 text-xs text-[#754be6]">复制解题步骤</button> : null}<ol className="mt-3 list-inside list-decimal space-y-3 whitespace-pre-wrap text-sm leading-relaxed">{(w.correctSteps ?? []).map((step, index) => <li key={index}>{text(step)}</li>)}</ol><div className="mt-4 rounded-xl bg-[#d7ef67]/25 p-4"><div className="flex justify-between gap-3"><p className="font-semibold">最终答案</p>{w.finalAnswer && <button onClick={() => void copy(w.finalAnswer!)} className="text-xs text-[#754be6]">复制答案</button>}</div><p className="mt-2 whitespace-pre-wrap">{text(w.finalAnswer)}</p></div>{w.remedialPractice?.length ? <div className="mt-4"><p className="text-sm font-semibold">补救练习建议</p><ul className="mt-2 list-inside list-disc space-y-2 text-sm">{w.remedialPractice.map((item, index) => <li key={index}>{text(item)}</li>)}</ul></div> : null}{w.teacherNote && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-[#f3f0ff] p-3 text-sm"><b>老师批注：</b>{text(w.teacherNote)}</p>}</>}</section>
        {isFamily && published && <section className={panel}><h2 className="font-semibold">04 · 再做一次，检查是否理解</h2><div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>掌握情况：{w.mastered === true ? "已理解" : w.mastered === false ? "仍不会" : "未标记"}</span><button disabled={busy} className={button} onClick={() => void act(async () => { await api.patch(`/api/v1/wrong-questions/${id}/status`, { mastered: true }); await load(); }, "已标记为已理解")}>我已理解</button><button disabled={busy} className={button} onClick={() => void act(async () => { await api.patch(`/api/v1/wrong-questions/${id}/status`, { mastered: false }); await load(); }, "已标记为仍不会")}>我仍不会</button></div><form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void act(async () => { await api.post(`/api/v1/wrong-questions/${id}/attempts`, { answer, result }); setAnswer(""); await load(); }, "再次作答已记录"); }}><label className="block text-sm">我的再次作答<textarea required maxLength={10000} value={answer} onChange={(event) => setAnswer(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-[#302a38]/15 p-3" placeholder="写下新的答案或解题过程…" /></label><div className="flex flex-wrap gap-3"><select aria-label="对照解析后的作答结果" value={result} onChange={(event) => setResult(event.target.value as typeof result)} className="rounded-xl border border-[#302a38]/15 px-3 py-2 text-sm"><option value="CORRECT">对照解析：答对了</option><option value="PARTIAL">对照解析：部分正确</option><option value="INCORRECT">对照解析：仍有错误</option></select><button disabled={busy || !answer.trim()} className={primary}>记录这次作答</button></div></form></section>}
        {w.attempts.length > 0 && <section className={panel}><h2 className="font-semibold">再次作答记录</h2><div className="mt-3 space-y-3">{w.attempts.map((attempt) => <article key={attempt.id} className="rounded-xl bg-[#f7f6fa] p-3 text-sm"><div className="flex justify-between gap-3 text-xs text-[#302a38]/60"><span>{new Date(attempt.attemptedAt).toLocaleString("zh-CN")}</span><span>{attemptLabels[attempt.result]}</span></div><p className="mt-2 whitespace-pre-wrap">{text(attempt.answer)}</p></article>)}</div></section>}
        {canReview && <section className={panel}><h2 className="font-semibold">老师复核与订正</h2><p className="mt-1 text-xs text-[#302a38]/60">核对原图后修订内容。知识点、步骤、错因与练习建议每行一项，保存后发布给学生。</p><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void act(async () => { await api.patch(`/api/v1/teacher/wrong-questions/${id}/review`, { ...draft, correctSteps: lines(draft.correctSteps), knowledgePoints: lines(draft.knowledgePoints), errorCauses: lines(draft.errorCauses), remedialPractice: lines(draft.remedialPractice) }); await load(); }, "审核结果已保存并发布"); }}><div className="grid gap-4 sm:grid-cols-2">{([ ["recognizedQuestion", "题目"], ["finalAnswer", "最终答案"], ["correctSteps", "解题步骤（每行一步）"], ["thinkingHint", "思路提示"], ["errorCauses", "错误原因（每行一项）"], ["knowledgePoints", "知识点（每行一项）"], ["remedialPractice", "补救练习建议（每行一项）"], ["teacherNote", "老师批注"] ] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<textarea value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border border-[#302a38]/15 p-3" maxLength={20000} required={key === "recognizedQuestion" || key === "finalAnswer"} /></label>)}</div><div className="flex flex-wrap gap-4"><label className="grid gap-1 text-sm">难度<select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as ReviewDraft["difficulty"] })} className="rounded-xl border border-[#302a38]/15 px-3 py-2"><option value="UNKNOWN">未标记</option><option value="EASY">基础</option><option value="MEDIUM">中等</option><option value="HARD">较难</option></select></label><label className="grid gap-1 text-sm">错误类型<input value={draft.errorType} onChange={(event) => setDraft({ ...draft, errorType: event.target.value })} className="rounded-xl border border-[#302a38]/15 px-3 py-2" /></label></div><button disabled={busy} className={primary}>保存并完成审核</button></form><div className="mt-6 border-t border-[#302a38]/10 pt-4"><button disabled={busy} className={`${button} text-[#754be6]`} onClick={() => void openMerge()}>合并重复错题</button>{mergeOpen && <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void act(async () => { await api.post(`/api/v1/teacher/wrong-questions/${id}/merge`, { targetId }); router.push(`/wrong-questions/${targetId}`); }); }}><p className="text-sm text-[#302a38]/65">选择保留的目标题，当前题的作答和错题记录将归入目标题。仅列出该学生同学科的最近 100 道错题。</p><select required aria-label="合并目标题" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="w-full rounded-xl border border-[#302a38]/15 p-3 text-sm"><option value="">请选择保留的目标题</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.recognizedQuestion ? text(item.recognizedQuestion).slice(0, 120) : "待识别题目"}</option>)}</select>{!candidates.length && <p className="text-sm text-[#302a38]/60">当前没有其他可合并错题。</p>}<div className="flex gap-3"><button disabled={busy || !targetId} className={primary}>确认合并到目标题</button><button type="button" className={button} onClick={() => setMergeOpen(false)}>取消</button></div></form>}</div></section>}
      </>}
      {activeImage && <div role="dialog" aria-modal="true" aria-label="题目原图预览" className="fixed inset-0 z-50 flex items-center justify-center bg-[#302a38]/80 p-5" onClick={() => setActiveImage(null)}><div className="max-h-[95vh] max-w-5xl overflow-auto rounded-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex justify-end"><button autoFocus className={button} onClick={() => setActiveImage(null)}>关闭预览 ✕</button></div><NextImage src={activeImage} alt="放大的题目原图" width={1600} height={1600} unoptimized className="h-auto max-h-[80vh] w-auto max-w-full object-contain" /></div></div>}
    </div>
  );
}

export default function WrongQuestionDetailPage({ params }: { params: Promise<{ id: string }> }) { return <AuthGuard><Detail params={params} /></AuthGuard>; }
