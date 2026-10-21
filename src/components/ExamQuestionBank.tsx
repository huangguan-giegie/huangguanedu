"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EXAM_PAPERS, sampleExamCurve, substituteExamParameters, type ExamQuestion } from "../lib/exam-bank";
import { EXAM_QUESTIONS } from "../lib/exam-bank-catalog";
import { compileExpression } from "../lib/diagram-renderer/expression-parser";
import { HubeiExamLab } from "./HubeiExamLab";
import { FreeGeometryEditor } from "./FreeGeometryEditor";
import styles from "./ExamQuestionBank.module.css";

const colors = ["#147e92", "#c8643e", "#6857a1", "#3d8661", "#ad7f28", "#ae4f7f"];
const paperOf = (question: ExamQuestion) => EXAM_PAPERS.find(p => p.id === question.paper)!;
const number = (n: number) => Number.isFinite(n) ? Number(n.toPrecision(7)).toString() : "不在定义域内";
const PAGE_SIZE = 12;

function ModelWorkbench({ question }: { question: ExamQuestion }) {
  const { model } = question;
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries((model.parameters ?? []).map(p => [p.key, p.value])));
  const [curves, setCurves] = useState(model.curves);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [probe, setProbe] = useState((model.bounds[0] + model.bounds[1]) / 2);
  const [bounds, setBounds] = useState(model.bounds);
  const clip = useId();
  const sampled = useMemo(() => curves.map(curve => {
    try { return { points: sampleExamCurve(curve, values), error: "" }; }
    catch { return { points: [], error: "表达式无法绘制，请检查括号、运算符和函数名称。" }; }
  }), [curves, values]);
  const [left, right, bottom, top] = bounds;
  // 横纵轴采用同一比例，圆与角度不会因窗口比例而变形。
  const scale = Math.min(650 / (right - left), 410 / (top - bottom));
  const to = (x: number, y: number) => ({ x: 360 + (x - (left + right) / 2) * scale, y: 235 - (y - (bottom + top) / 2) * scale });
  const origin = to(0, 0);
  const readings = curves.map(curve => {
    try {
      if (probe < curve.from || probe > curve.to) return { x: NaN, y: NaN, slope: NaN };
      const fx = compileExpression(substituteExamParameters(curve.x, values)).evaluate;
      const fy = compileExpression(substituteExamParameters(curve.y, values)).evaluate;
      const delta = 1e-5 * Math.max(1, Math.abs(probe));
      const dx = fx(probe + delta) - fx(probe - delta);
      const slope = Math.abs(dx) < 1e-12 ? NaN : (fy(probe + delta) - fy(probe - delta)) / dx;
      return { x: fx(probe), y: fy(probe), slope };
    } catch { return { x: NaN, y: NaN, slope: NaN }; }
  });
  if (model.lesson) return <HubeiExamLab initialCase={model.lesson} embedded />;
  if (model.geometry) return <><p className={styles.note}>{model.note}</p><FreeGeometryEditor initialDocument={model.geometry} storageKey={null} /></>;
  const addExpression = () => {
    if (curves.length >= 10) { setError("最多同时绘制10条曲线，请先移除不需要的曲线。"); return; }
    try {
      compileExpression(draft, { maxLength: 180 });
      setCurves(previous => [...previous, { name: `y = ${draft}`, x: "x", y: draft, from: left, to: right }]);
      setDraft(""); setError("");
    } catch { setError("请输入有效的函数表达式，支持 x、sin、cos、ln、exp、sqrt、abs 等。"); }
  };
  const path = (points: { x: number; y: number }[]) => {
    let connected = false, previous: { x: number; y: number } | null = null;
    return points.map(point => {
      const valid = Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= left - (right - left) && point.x <= right + (right - left) && point.y >= bottom - (top - bottom) && point.y <= top + (top - bottom);
      if (!valid) { connected = false; previous = null; return ""; }
      const p = to(point.x, point.y);
      const continuous = connected && previous && Math.hypot(p.x - previous.x, p.y - previous.y) < 90;
      connected = true; previous = p;
      return `${continuous ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(" ");
  };
  return <div className={styles.workbench}>
    <section className={styles.plot} aria-label="已加载的真题实验模型">
      <div className={styles.plotHeading}><strong>原题模型 · 实时探究</strong><span>横纵等比例 · 数值近似</span></div>
      <svg viewBox="0 0 720 470" role="img" aria-label={`${question.title}的函数或曲线图像`}>
        <defs><clipPath id={clip}><rect x="25" y="20" width="670" height="425" /></clipPath></defs>
        <g clipPath={`url(#${clip})`}>
          {Array.from({ length: 11 }, (_, i) => {
            const x = left + (right - left) * i / 10, y = bottom + (top - bottom) * i / 10;
            const px = to(x, 0), py = to(0, y);
            return <g key={i} className={styles.grid}><line x1={px.x} y1="20" x2={px.x} y2="445" /><line x1="25" y1={py.y} x2="695" y2={py.y} /></g>;
          })}
          <g className={styles.axes}><line x1="25" y1={origin.y} x2="695" y2={origin.y} /><line x1={origin.x} y1="20" x2={origin.x} y2="445" /></g>
          {sampled.map((sample, i) => <path key={i} d={path(sample.points)} fill="none" stroke={colors[i % colors.length]} strokeWidth="2.5" />)}
          {readings.map((r, i) => {
            if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
            const q = to(r.x, r.y);
            return <circle key={i} cx={q.x} cy={q.y} r="4.5" fill={colors[i % colors.length]} stroke="white" strokeWidth="1.5" />;
          })}
        </g>
        <text x="30" y="463">x ∈ [{number(left)}, {number(right)}]　y ∈ [{number(bottom)}, {number(top)}]</text>
      </svg>
      {model.note && <p className={styles.note}>{model.note}</p>}
      <p className={styles.note}>图像、斜率与测量用于观察。结论需结合原题的定义域、参数限制和解析推导。</p>
      <div className={styles.readings} aria-live="polite">{readings.map((r, i) => <div key={i} style={{ borderColor: colors[i % colors.length] }}><strong>曲线 {i + 1}</strong><span>点 ({number(r.x)}, {number(r.y)})</span><small>切线斜率 ≈ {number(r.slope)}</small></div>)}</div>
    </section>
    <aside className={styles.controls}>
      <h3>实验条件</h3>
      {(model.parameters ?? []).map(param => <label key={param.key}>{param.label}<output>{number(values[param.key])}</output>
        <input aria-label={param.label} type="range" min={param.min} max={param.max} step={param.step} value={values[param.key]} onChange={ev => setValues(previous => ({ ...previous, [param.key]: Number(ev.target.value) }))} />
        <input aria-label={`${param.label}精确值`} type="number" min={param.min} max={param.max} step={param.step === 1 ? 1 : "any"} value={values[param.key]} onChange={ev => { const n = Number(ev.target.value); if (ev.target.value !== "" && Number.isFinite(n) && n >= param.min && n <= param.max && (param.step !== 1 || Number.isInteger(n))) setValues(previous => ({ ...previous, [param.key]: n })); }} />
      </label>)}
      <label>取样自变量 t / x<output>{number(probe)}</output><input aria-label="取样自变量" type="range" min={left} max={right} step={(right - left) / 600} value={probe} onChange={ev => setProbe(Number(ev.target.value))} /></label>
      <details><summary>坐标窗口</summary>{(["x最小值", "x最大值", "y最小值", "y最大值"] as const).map((label, i) => <label key={label}>{label}<input aria-label={label} type="number" value={bounds[i]} onChange={ev => { const n = Number(ev.target.value); const next = [...bounds] as typeof bounds; next[i] = n; if (ev.target.value && Number.isFinite(n) && Math.abs(n) <= 10000 && next[1] - next[0] >= .1 && next[3] - next[2] >= .1) setBounds(next); }} /></label>)}</details>
      <h3>已载入的曲线</h3>
      <ol className={styles.curves}>{curves.map((curve, i) => <li key={i}>
        <span style={{ color: colors[i % colors.length] }}>{curve.name}</span>
        <small>x(t)={substituteExamParameters(curve.x, values)}<br />y(t)={substituteExamParameters(curve.y, values)}</small>
        {sampled[i].error && <p role="alert">{sampled[i].error}</p>}
        <button type="button" aria-label={`移除曲线${i + 1}`} onClick={() => setCurves(old => old.filter((_, j) => j !== i))}>移除</button>
        {curve.x === "x" && <Link href={`/math-studio?view=functions&expression=${encodeURIComponent(substituteExamParameters(curve.y, values))}`}>在函数探索中继续 →</Link>}
      </li>)}</ol>
      <form onSubmit={ev => { ev.preventDefault(); addExpression(); }}><label>添加对照函数 y=<input aria-label="添加对照函数" value={draft} maxLength={180} placeholder="例如 x^2-3 或 sin(x)" onChange={ev => setDraft(ev.target.value)} /></label><button type="submit">添加函数</button></form>
      {error && <p role="alert">{error}</p>}
      <Link href="/math-studio?view=cas">打开符号计算 →</Link>
    </aside>
  </div>;
}

export function ExamQuestionBank({initialQuestion}:{initialQuestion?:string}={}) {
  const [selectedId,setSelectedId]=useState(initialQuestion);
  const selected = EXAM_QUESTIONS.find(q => q.id === selectedId);
  useEffect(()=>{
    const restore=()=>setSelectedId(new URL(window.location.href).searchParams.get("question")??undefined);
    window.addEventListener("popstate",restore);
    return ()=>window.removeEventListener("popstate",restore);
  },[]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [year, setYear] = useState("");
  const [paper, setPaper] = useState("");
  const [topic, setTopic] = useState("");
  const [page, setPage] = useState(0);
  const [reset, setReset] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => EXAM_QUESTIONS.filter(q => {
    const p = paperOf(q);
    const normalize=(value:string)=>value.normalize("NFKC").toLocaleLowerCase().replace(/全国一卷/g,"全国i卷");
    const terms = normalize(search).replace(/第(\d+)题?/g,"$1").match(/\d+|[^\d\s]+/g)??[];
    const text = normalize(`${p.year} ${p.stage} ${p.name} ${p.file} ${q.title} ${q.topic} 第${q.number}题 ${q.id}`);
    return (!stage || p.stage === stage) && (!year || String(p.year) === year) && (!paper || q.paper === paper) && (!topic || q.topic === topic) && terms.every(term => text.includes(term));
  }).sort((a, b) => paperOf(b).year - paperOf(a).year || a.paper.localeCompare(b.paper) || a.number - b.number), [search, stage, year, paper, topic]);
  const choose = (id?: string) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("question", id); else url.searchParams.delete("question");
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    setSelectedId(id);
    setReset(0);
    heading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const index = selected ? filtered.findIndex(q => q.id === selected.id) : -1;
  const navigation = index >= 0 ? filtered : EXAM_QUESTIONS;
  const currentIndex = selected ? navigation.findIndex(q => q.id === selected.id) : -1;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const clearFilters = () => { setSearch(""); setStage(""); setYear(""); setPaper(""); setTopic(""); setPage(0); };
  return <section className={styles.root} aria-label="数学实验室真题题库" ref={heading}>
    <header className={styles.hero}><div><span>REAL EXAM LIBRARY</span><h1>数学实验室 · 真题题库</h1><p>选一道原题，加载它的图形、函数和实验条件。</p></div>
      <div className={styles.total}><strong>{EXAM_QUESTIONS.length}</strong><span>道可加载题目 · {EXAM_PAPERS.length}份试卷</span></div>
    </header>
    {selected ? <article className={styles.active}>
      <div className={styles.actions}><button type="button" onClick={() => choose()}>← 返回题库</button><span>{index >= 0 ? `当前筛选第 ${index + 1} / ${filtered.length} 题` : "已通过题目链接加载"}</span>
        <button type="button" disabled={currentIndex <= 0} onClick={() => choose(navigation[currentIndex - 1]?.id)}>上一题</button>
        <button type="button" disabled={currentIndex >= navigation.length - 1} onClick={() => choose(navigation[currentIndex + 1]?.id)}>下一题 →</button>
      </div>
      <div className={styles.questionHeading}><div><p>{paperOf(selected).year} · {paperOf(selected).name} · 第{selected.number}题 · {selected.topic}</p><h2>{selected.title}</h2></div><button type="button" onClick={() => setReset(n => n + 1)}>重置本题实验</button></div>
      {paperOf(selected).note && <p className={styles.note}>{paperOf(selected).note}</p>}
      <details className={styles.source} open key={selected.id}><summary>原题题干与配图 · {paperOf(selected).file} · 第{selected.pages.join("、")}页</summary>
        <p>查看原卷中的第{selected.number}题；点击图片可放大阅读。跨页题目已包含续页。{selected.paper === "2026n" ? "这份资料的解析与题目排在同页。" : ""}</p>
        <div className={styles.sourcePages}>{selected.pages.map(n => <a key={n} href={`/exam-bank/${selected.paper}/page-${n}.webp`} target="_blank" rel="noreferrer" aria-label={`放大原卷第${n}页，第${selected.number}题`}><Image unoptimized width={1654} height={2339} src={`/exam-bank/${selected.paper}/page-${n}.webp`} alt={`${paperOf(selected).year}${paperOf(selected).name}第${n}页；请阅读第${selected.number}题`} /></a>)}</div>
      </details>
      <ModelWorkbench key={`${selected.id}-${reset}`} question={selected} />
    </article> : <>
      <div className={styles.filters}>
        <label className={styles.search}>查找题目<input type="search" aria-label="查找真题" placeholder="年份、题号、卷别、椭圆、切线……" value={search} onChange={ev => { setSearch(ev.target.value); setPage(0); }} /></label>
        <label>学段<select aria-label="筛选学段" value={stage} onChange={ev => { setStage(ev.target.value); setPaper(""); setPage(0); }}><option value="">全部学段</option><option>中考</option><option>高考</option></select></label>
        <label>年份<select aria-label="筛选年份" value={year} onChange={ev => { setYear(ev.target.value); setPaper(""); setPage(0); }}><option value="">全部年份</option>{[...new Set(EXAM_PAPERS.map(p => p.year))].sort((a, b) => b - a).map(y => <option key={y}>{y}</option>)}</select></label>
        <label>试卷<select aria-label="筛选试卷" value={paper} onChange={ev => { setPaper(ev.target.value); setPage(0); }}><option value="">全部试卷</option>{EXAM_PAPERS.filter(p => (!stage || p.stage === stage) && (!year || String(p.year) === year)).map(p => <option key={p.id} value={p.id}>{p.year} {p.name}</option>)}</select></label>
        <label>专题<select aria-label="筛选专题" value={topic} onChange={ev => { setTopic(ev.target.value); setPage(0); }}><option value="">全部专题</option>{[...new Set(EXAM_QUESTIONS.map(q => q.topic))].map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <div className={styles.resultHeading}><strong role="status">找到 {filtered.length} 道题</strong><button type="button" onClick={clearFilters}>清空筛选</button></div>
      {filtered.length ? <div className={styles.cards}>{filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(q => {
        const p = paperOf(q);
        return <article key={q.id}><div className={styles.cardMeta}><span>{p.stage} · {p.year}</span><strong>第{q.number}题</strong></div><small>{p.name}</small><h2>{q.title}</h2><p>{q.topic}</p><div><span>{q.model.lesson ? "逐问探究与推导" : q.model.geometry ? "作图与测量" : "函数与曲线实验"}</span><button type="button" onClick={() => choose(q.id)} aria-label={`加载${p.year}${p.name}第${q.number}题`}>加载题目 →</button></div></article>;
      })}</div> : <div className={styles.empty}><h2>没有符合条件的题目</h2><p>可以减少一个筛选条件，或搜索题目中的专题名称。</p><button type="button" onClick={clearFilters}>查看全部题目</button></div>}
      <nav className={styles.pagination} aria-label="题库分页"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pages} 页</span><button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页 →</button></nav>
      <details className={styles.coverage}><summary>题库来源与适用范围</summary><p>从所提供试卷中整理二维函数、曲线、平面作图和代数题。实验可以辅助观察与计算；证明题仍需写出推导。立体几何、纯统计概率、数列及当前工具无法完整表达的抽象条件题未计入题库。2023、2024试卷及2019文科题面未在这批资料中提供。</p><ul>{EXAM_PAPERS.map(p => <li key={p.id}>{p.year} {p.name}：{EXAM_QUESTIONS.filter(q => q.paper === p.id).length} 道 · {p.file}{p.note && `（${p.note}）`}</li>)}</ul></details>
    </>}
  </section>;
}
