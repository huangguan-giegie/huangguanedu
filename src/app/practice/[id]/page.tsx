"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";
import { Icon } from "../../../components/icons";
import { PracticeDiagram } from "../../../components/PracticeDiagram";
import { CyclicDiameterDiagram } from "../../../components/CyclicDiameterDiagram";
import { GeometrySnapshot } from "../../../components/GeometrySnapshot";
import {parseDocumentJSON,type GeometryDocument} from "../../../lib/free-geometry";
import { detectLegacyCyclicDiameterQuestion } from "../../../lib/cyclic-diameter-geometry";
import { PracticeAnswerBox } from "../../../components/PracticeAnswerBox";
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
  // 作答模式默认关闭：这个页面同时承担「阅读/打印练习卷」的职责，
  // 默认展开输入框会干扰打印，也让学生失去先独立思考的空间。
  const [answerMode, setAnswerMode] = useState(false);
  const [localSketches,setLocalSketches]=useState<Record<string,GeometryDocument>>({});
  const [sketchMessage,setSketchMessage]=useState("");
  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      try{
        const saved=window.localStorage.getItem("hg-practice-geometry-sketches-v1");
        if(saved&&saved.length<=600000){
          const parsed=JSON.parse(saved) as Record<string,unknown>;
          const valid:Record<string,GeometryDocument>={};
          for(const [questionId,value] of Object.entries(parsed).slice(0,25)){
            try{valid[questionId]=parseDocumentJSON(JSON.stringify(value));}catch{/** ignore corrupt saved drawings */}
          }
          setLocalSketches(valid);
        }
      }catch{/** private browsing or disabled localStorage */}
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[]);
  function attachSketch(questionId:string){
    try{
      const json=window.localStorage.getItem("hg-geometry-clipboard-v1");
      if(!json)throw Error("剪贴板为空。请先到自由编辑器点击「送到模拟题」。");
      const document=parseDocumentJSON(json);
      const next={...localSketches,[questionId]:document};
      window.localStorage.setItem("hg-practice-geometry-sketches-v1",JSON.stringify(next));
      setLocalSketches(next);
      setSketchMessage("已将作品添加到此题的本地附图。题干、标准答案和评分不变。");
    }catch(e){setSketchMessage(e instanceof Error?e.message:"插入失败");}
  }
  function removeSketch(questionId:string){
    const next={...localSketches};delete next[questionId];
    try{window.localStorage.setItem("hg-practice-geometry-sketches-v1",JSON.stringify(next));}
    catch{setSketchMessage("浏览器无法保存改动");}
    setLocalSketches(next);
  }

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
      <header className={styles.detailHead}><div><p className={styles.eyebrow}>错题模拟题</p><h1>{set.title}</h1><p>{set.studentName} · {set.questions.length} 道题 · {new Date(set.createdAt).toLocaleDateString("zh-CN")}</p></div><span className={styles.detailMark} aria-hidden="true"><Icon name="practice" size={32} /></span></header>
      <div className={`${styles.toolbar} ${styles.noPrint}`}><label><input type="checkbox" checked={showAnswers} onChange={(event) => { setShowAnswers(event.target.checked); setRevealed([]); }} />显示全部答案与解析</label><div><button type="button" className={styles.secondaryButton} onClick={() => void copy()}>复制{showAnswers ? "题目与答案" : "题目"}</button><button type="button" className="button-primary" onClick={() => window.print()}>打印 / 保存 PDF</button></div></div>
      <div className={`${styles.answerModeBar} ${styles.noPrint}`}>
        <label className={styles.answerModeToggle}>
          <input
            type="checkbox"
            checked={answerMode}
            onChange={(event) => setAnswerMode(event.target.checked)}
          />
          在线答题（提交后自动判分并更新掌握度）
        </label>
        {answerMode && (
          <p className={styles.answerModeHint}>
            先自己写，再提交对答案。判分是确定性的，不会调用模型；数值题直接比结果，复杂表达式才交给 AI 复核。
          </p>
        )}
      </div>
      <p className={`${styles.printHint} ${styles.noPrint}`}>打印会保留当前显示的答案。需要空白练习卷时，请先隐藏答案。</p>
      {message && <p className={`${styles.task} ${styles.noPrint}`} role="status">{message}</p>}
      {sketchMessage&&<p role="status" className={styles.noPrint}>{sketchMessage}（仅此浏览器保存；跨设备或正式共享需另行发布。）</p>}
      <div className={styles.questions}>{set.questions.map((question, index) => {
        const answerVisible = showAnswers || revealed.includes(question.id);
        const fixedAngle = detectLegacyCyclicDiameterQuestion(question.question);
        const requiresRepair = fixedAngle !== null && !question.diagram;
        return <article className={styles.questionCard} key={question.id}>
          <div className={styles.questionHead}><span className={styles.questionIndex}>第 {String(index + 1).padStart(2, "0")} 题</span><span className={styles.questionHint}>先独立思考，再对照解析</span></div>
          <p className={styles.questionText}>{latexToUnicode(question.question)}</p>
          {question.diagram && <PracticeDiagram diagram={question.diagram} />}
          {requiresRepair && <CyclicDiameterDiagram obtuseAngle={fixedAngle} />}
          {localSketches[question.id] && <GeometrySnapshot document={localSketches[question.id]} />}
          <div className={styles.noPrint} style={{display:"flex",gap:9,margin:"12px 0",flexWrap:"wrap"}}>
            <button type="button" className={styles.secondaryButton} onClick={()=>attachSketch(question.id)}>插入编辑器作品</button>
            {localSketches[question.id]&&<button type="button" className={styles.textButton} onClick={()=>removeSketch(question.id)}>移除附图</button>}
          </div>
          {requiresRepair && <p className={styles.printHint}>原始图片与题设角度不一致，已用经过角度校验的示意图替换。旧题的答案仍需人工复核。</p>}
          {!requiresRepair && question.imageUrl && <button type="button" className={styles.diagramButton} onClick={() => setPreview(question.imageUrl!)} aria-label={`放大第 ${index + 1} 题示意图`}>
            {/* 题图使用短期授权地址，直接加载可避免代理缓存过期地址。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.diagram} src={question.imageUrl} alt={`第 ${index + 1} 题示意图`} />
          </button>}
          <button type="button" className={`${styles.answerToggle} ${styles.noPrint}`} aria-expanded={answerVisible} onClick={() => { if (showAnswers) { setShowAnswers(false); setRevealed(set.questions.filter((item) => item.id !== question.id).map((item) => item.id)); } else { setRevealed((ids) => ids.includes(question.id) ? ids.filter((value) => value !== question.id) : [...ids, question.id]); } }}>{answerVisible ? "收起答案与解析" : "查看答案与解析"}<Icon name="chevron-right" size={16} style={{ transform: answerVisible ? "rotate(-90deg)" : "rotate(90deg)" }} /></button>
          {answerVisible && <div className={styles.answer}><h2>参考答案</h2><p>{latexToUnicode(question.answer)}</p>{question.explanation && <><h2>解题思路</h2><p>{latexToUnicode(question.explanation)}</p></>}</div>}
          {answerMode && (
            <div className={styles.noPrint}>
              <PracticeAnswerBox practiceQuestionId={question.id} subject={set.subject ?? "MATH"} />
            </div>
          )}
        </article>;
      })}</div>
      {set.questions.some((question) => question.imageUrl) && <div className={`${styles.noPrint} ${styles.imageHelp}`}>题图未显示？<button type="button" className={styles.textButton} onClick={() => setReload((value) => value + 1)}>重新加载题图</button></div>}
    </>}
    <dialog ref={dialog} className={`${styles.imageDialog} ${styles.noPrint}`} onClose={() => setPreview(null)} aria-label="题目示意图预览"><button type="button" className={styles.secondaryButton} onClick={() => setPreview(null)} autoFocus><Icon name="close" size={16} /> 关闭预览</button>{preview && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="放大的题目示意图" />
    </>}</dialog>
  </div>;
}

export default function PracticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGuard><PracticeDetail id={id} /></AuthGuard>;
}
