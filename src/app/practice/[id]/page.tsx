"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";
import { practiceText, type PracticeSetItem } from "../../../components/practice-content";
import { latexToUnicode } from "../../../lib/latex-to-unicode";
import styles from "../practice.module.css";

function PracticeDetail({ id }: { id: string }) {
  const [set, setSet] = useState<PracticeSetItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAnswers, setShowAnswers] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<PracticeSetItem>(`/api/v1/practice-sets/${encodeURIComponent(id)}`)
      .then((data) => { if (!cancelled) { setSet(data); setLoading(false); setError(""); } })
      .catch((cause) => { if (!cancelled) { setLoading(false); setError(cause instanceof Error ? cause.message : "模拟题加载失败"); } });
    return () => { cancelled = true; };
  }, [id, reload]);

  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);

  async function copy() {
    if (!set) return;
    setMessage("");
    try {
      await navigator.clipboard.writeText(practiceText(set, showAnswers));
      setMessage(showAnswers ? "题目、答案和解析已复制。" : "题目已复制（不含答案）。");
    } catch { setMessage("复制失败，请使用浏览器打印保存练习。"); }
  }

  return <div className={styles.page}>
    <Link href="/practice" className={`${styles.textButton} ${styles.noPrint}`}>← 返回模拟题</Link>
    {loading ? <p className={styles.empty}>正在打开练习…</p> : error ? <div className={styles.error} role="alert">{error} <button type="button" className={styles.textButton} onClick={() => { setLoading(true); setReload((value) => value + 1); }}>重试</button></div> : set && <>
      <header className={styles.detailHead}><div><p className={styles.eyebrow}>错题模拟题</p><h1>{set.title}</h1><p>{set.studentName} · {set.questions.length} 道题 · {new Date(set.createdAt).toLocaleDateString("zh-CN")}</p></div><span className={styles.detailMark} aria-hidden="true">✦</span></header>
      <div className={`${styles.toolbar} ${styles.noPrint}`}><label><input type="checkbox" checked={showAnswers} onChange={(event) => { setShowAnswers(event.target.checked); setRevealed([]); }} />显示全部答案与解析</label><div><button type="button" className={styles.secondaryButton} onClick={() => void copy()}>复制{showAnswers ? "题目与答案" : "题目"}</button><button type="button" className="button-primary" onClick={() => window.print()}>打印 / 保存 PDF</button></div></div>
      <p className={`${styles.printHint} ${styles.noPrint}`}>打印会保留当前显示的答案。需要空白练习卷时，请先隐藏答案。</p>
      {message && <p className={`${styles.task} ${styles.noPrint}`} role="status">{message}</p>}
      <div className={styles.questions}>{set.questions.map((question, index) => {
        const answerVisible = showAnswers || revealed.includes(question.id);
        return <article className={styles.questionCard} key={question.id}>
          <div className={styles.questionHead}><span className={styles.questionIndex}>第 {String(index + 1).padStart(2, "0")} 题</span><span className={styles.questionHint}>先独立思考，再对照解析</span></div>
          <p className={styles.questionText}>{latexToUnicode(question.question)}</p>
          {question.imageUrl && <button type="button" className={styles.diagramButton} onClick={() => setPreview(question.imageUrl!)} aria-label={`放大第 ${index + 1} 题示意图`}>
            {/* 题图使用短期授权地址，直接加载可避免代理缓存过期地址。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.diagram} src={question.imageUrl} alt={`第 ${index + 1} 题示意图`} />
          </button>}
          <button type="button" className={`${styles.answerToggle} ${styles.noPrint}`} aria-expanded={answerVisible} onClick={() => { if (showAnswers) { setShowAnswers(false); setRevealed(set.questions.filter((item) => item.id !== question.id).map((item) => item.id)); } else { setRevealed((ids) => ids.includes(question.id) ? ids.filter((value) => value !== question.id) : [...ids, question.id]); } }}>{answerVisible ? "收起答案与解析 ↑" : "查看答案与解析 ↓"}</button>
          {answerVisible && <div className={styles.answer}><h2>参考答案</h2><p>{latexToUnicode(question.answer)}</p>{question.explanation && <><h2>解题思路</h2><p>{latexToUnicode(question.explanation)}</p></>}</div>}
        </article>;
      })}</div>
      {set.questions.some((question) => question.imageUrl) && <div className={`${styles.noPrint} ${styles.imageHelp}`}>题图未显示？<button type="button" className={styles.textButton} onClick={() => setReload((value) => value + 1)}>重新加载题图</button></div>}
    </>}
    <dialog ref={dialog} className={`${styles.imageDialog} ${styles.noPrint}`} onClose={() => setPreview(null)} aria-label="题目示意图预览"><button type="button" className={styles.secondaryButton} onClick={() => setPreview(null)} autoFocus>关闭预览 ×</button>{preview && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="放大的题目示意图" />
    </>}</dialog>
  </div>;
}

export default function PracticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGuard><PracticeDetail id={id} /></AuthGuard>;
}
