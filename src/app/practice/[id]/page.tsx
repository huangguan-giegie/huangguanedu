"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";
import { Icon } from "../../../components/icons";
import { PracticeDiagram } from "../../../components/PracticeDiagram";
import { AttachedGeometryFigure } from "../../../components/AttachedGeometryFigure";
import {GEOMETRY_DRAFT_KEY,geometryDraftImport} from "../../../lib/practice-drawing";
import {matchingLegacyDiameterProblem} from "../../../lib/legacy-circle-repair";
import type {GeometryDocument} from "../../../lib/free-geometry";
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
  const [draft,setDraft]=useState<GeometryDocument|null>(null);
  const [draftVisible,setDraftVisible]=useState<string|null>(null);
  const [canPublish,setCanPublish]=useState(false);
  const [acknowledged,setAcknowledged]=useState(false);
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

  useEffect(()=>{
    api.get<{user:{role:string}}>("/api/v1/auth/me").then(({user})=>{
      setCanPublish(user.role==="TEACHER"||user.role==="ADMIN");
    }).catch(()=>setCanPublish(false));
    const frame=window.requestAnimationFrame(()=>{
      try{
        const raw=window.localStorage.getItem(GEOMETRY_DRAFT_KEY);
        if(raw)setDraft(geometryDraftImport(raw));
      }catch{setDraft(null);}
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[]);
  async function repairLegacyQuestion(questionId:string){
    if(!set||!canPublish)return;
    if(!window.confirm("这会将当前题图和标准答案替换为数学重新计算的版本，确认执行？"))return;
    try{
      await api.post(`/api/v1/practice-sets/${encodeURIComponent(set.id)}/questions/${encodeURIComponent(questionId)}/repair`,{});
      setMessage("旧题已按圆周角定理修复并保存。");
      setReload(n=>n+1);
    }catch(e){setMessage(e instanceof Error?e.message:"修复失败");}
  }
  async function publishDrawing(questionId:string){
    if(!draft||!set||!acknowledged)return;
    setMessage("");
    try{
      await api.post(`/api/v1/practice-sets/${encodeURIComponent(set.id)}/questions/${encodeURIComponent(questionId)}/drawing`,
        {drawing:draft,confirmed:true});
      setMessage("已把经人工确认的作图保存到此题；答案与评分保持不变。");
      setReload(n=>n+1);
    }catch(e){setMessage(e instanceof Error?e.message:"保存配图失败");}
  }
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
      <div className={styles.questions}>{set.questions.map((question, index) => {
        const answerVisible = showAnswers || revealed.includes(question.id);
        const legacy=question.imageUrl&&!question.diagram?matchingLegacyDiameterProblem(question.question):null;
        return <article className={styles.questionCard} key={question.id}>
          <div className={styles.questionHead}><span className={styles.questionIndex}>第 {String(index + 1).padStart(2, "0")} 题</span><span className={styles.questionHint}>先独立思考，再对照解析</span></div>
          <p className={styles.questionText}>{latexToUnicode(question.question)}</p>
          {question.diagram && <PracticeDiagram diagram={question.diagram} />}
          {legacy&&<div style={{border:"1px solid #e6b77b",padding:13,borderRadius:12,margin:"12px 0",background:"#fff8e8",color:"#643b1e"}}>
            <strong>检测到旧版题图的角度可能不一致，已隐藏原 AI 图片</strong>
            <p style={{fontSize:13,lineHeight:1.8,marginTop:7}}>按该题已知条件，∠BAC 应为 {legacy.answer}。下图是经过圆周角计算的新图。旧数据库答案仍需要老师复核，修复前建议不要在线提交此题。</p>
            <PracticeDiagram diagram={legacy.diagram}/>
            {canPublish&&<button type="button" className={styles.secondaryButton}
              onClick={()=>void repairLegacyQuestion(question.id)}>核对后修复此题图片及标准答案</button>}
          </div>}
          {question.attachedDrawing && <AttachedGeometryFigure document={question.attachedDrawing} />}
          {draft && <div className={styles.noPrint} style={{margin:"12px 0",padding:"12px 16px",border:"1px solid var(--line)",borderRadius:12}}>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <button type="button" className={styles.secondaryButton}
                onClick={()=>setDraftVisible(draftVisible===question.id?null:question.id)}>
                {draftVisible===question.id?"取消预览":"预览工作台图形"}
              </button>
              {canPublish&&<button type="button" className={styles.secondaryButton}
                disabled={!acknowledged} onClick={()=>void publishDrawing(question.id)}>
                将当前图形保存到本题
              </button>}
              {!canPublish&&<span style={{fontSize:12}}>学生可在本设备预览；由老师核对后才能保存为共享题图。</span>}
            </div>
            {canPublish&&<label style={{display:"flex",gap:8,alignItems:"center",marginTop:8,fontSize:12}}>
              <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>
              我已核对自定义图形与本题全部已知条件、角度及答案一致
            </label>}
            {draftVisible===question.id&&<AttachedGeometryFigure document={draft}/>}
          </div>}
          {question.imageUrl && !legacy && <button type="button" className={styles.diagramButton} onClick={() => setPreview(question.imageUrl!)} aria-label={`放大第 ${index + 1} 题示意图`}>
            {/* 题图使用短期授权地址，直接加载可避免代理缓存过期地址。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.diagram} src={question.imageUrl} alt={`第 ${index + 1} 题示意图`} />
          </button>}
          <button type="button" className={`${styles.answerToggle} ${styles.noPrint}`} aria-expanded={answerVisible} onClick={() => { if (showAnswers) { setShowAnswers(false); setRevealed(set.questions.filter((item) => item.id !== question.id).map((item) => item.id)); } else { setRevealed((ids) => ids.includes(question.id) ? ids.filter((value) => value !== question.id) : [...ids, question.id]); } }}>{answerVisible ? "收起答案与解析" : "查看答案与解析"}<Icon name="chevron-right" size={16} style={{ transform: answerVisible ? "rotate(-90deg)" : "rotate(90deg)" }} /></button>
          {answerVisible && <div className={styles.answer}><h2>参考答案</h2><p>{latexToUnicode(question.answer)}</p>{question.explanation && <><h2>解题思路</h2><p>{latexToUnicode(question.explanation)}</p></>}</div>}
          {answerMode && !legacy && (
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
