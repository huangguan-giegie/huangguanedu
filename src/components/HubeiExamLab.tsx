"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  LOCAL_EXAM_CASES, LOCAL_EXAM_DEFAULTS, localExamLesson, examNumber,
  type LocalExamId, type LocalExamLesson,
} from "../lib/hubei-exam-cases";
import type { Point } from "../lib/verified-exam-casebook";
import styles from "./HubeiExamLab.module.css";

const colors = { curve: "#247c94", construction: "#b36b3c", highlight: "#a85536", guide: "#91a7af" };
function ExamDrawing({ lesson, title }: { lesson: LocalExamLesson; title: string }) {
  const clip = useId();
  const all = [...lesson.paths.flatMap(p => p.points), ...lesson.labels, ...(lesson.axes ? [{ x: 0, y: 0 }] : [])];
  const left = Math.min(...all.map(p => p.x)), right = Math.max(...all.map(p => p.x));
  const bottom = Math.min(...all.map(p => p.y)), top = Math.max(...all.map(p => p.y));
  const scale = Math.min(620 / Math.max(1, right - left), 330 / Math.max(1, top - bottom));
  const project = (p: Point) => ({ x: 360 + (p.x - (left + right) / 2) * scale, y: 215 - (p.y - (top + bottom) / 2) * scale });
  const zero = project({ x: 0, y: 0 });
  return <svg className={styles.canvas} viewBox="0 0 720 440" role="img" aria-label={title}>
    <title>{title}</title><desc>横纵轴等比例，所有点和测量由原题的同一组条件计算。</desc>
    <defs><clipPath id={clip}><rect x="16" y="12" width="688" height="416" /></clipPath></defs>
    {lesson.axes && <g className={styles.axes}>
      <line x1="20" y1={zero.y} x2="700" y2={zero.y} /><line x1={zero.x} y1="20" x2={zero.x} y2="420" />
      <text x="690" y={zero.y - 9}>x</text><text x={zero.x + 9} y="26">y</text>
      <text x={zero.x + 7} y={zero.y + 18}>O</text>
    </g>}
    <g clipPath={`url(#${clip})`}>
      {lesson.paths.map((path, i) => <path key={i}
        d={path.points.map((pt, j) => { const p = project(pt); return `${j ? "L" : "M"}${p.x.toFixed(3)} ${p.y.toFixed(3)}`; }).join(" ") + (path.closed ? " Z" : "")}
        stroke={colors[path.tone ?? "construction"]} strokeWidth={path.tone === "highlight" ? 3.5 : 2.2}
        fill={path.closed ? colors[path.tone ?? "construction"] : "none"} fillOpacity=".08"
        strokeLinejoin="round" strokeDasharray={path.dashed ? "7 5" : undefined} />)}
    </g>
    {lesson.labels.map((point, i) => {
      const p = project(point);
      return <g key={i}><circle cx={p.x} cy={p.y} r="4.6" fill="#a85536" stroke="var(--surface,#fff)" strokeWidth="1.8" />
        <text className={styles.pointText} x={p.x + (point.dx ?? 9)} y={p.y + (point.dy ?? -11)}>{point.label}</text></g>;
    })}
  </svg>;
}

export function HubeiExamLab({ initialCase = "square", embedded = false }: { initialCase?: LocalExamId; embedded?: boolean }) {
  const [selected, setSelected] = useState<LocalExamId>(initialCase);
  const [stage, setStage] = useState(0);
  const [parameters, setParameters] = useState(() => Object.fromEntries(
    Object.entries(LOCAL_EXAM_DEFAULTS).map(([id, values]) => [id, { ...values }]),
  ) as Record<LocalExamId, Record<string, number>>);
  const [showProof, setShowProof] = useState(false);
  const [copied, setCopied] = useState("");
  const source = LOCAL_EXAM_CASES.find(c => c.id === selected)!;
  const input = parameters[selected], lesson = localExamLesson(selected, input, stage);
  const part = lesson.parts[stage];
  const changeParameters = (values: Record<string, number>) => {
    setParameters(previous => ({ ...previous, [selected]: { ...previous[selected], ...values } }));
    setCopied("");
  };
  const chooseStage = (next: number) => { setStage(next); setShowProof(false); setCopied(""); };
  const copy = async () => {
    const text = `${source.paper}数学${source.question} · 按原卷条件重述\n来源：${source.file} 第${source.page}页\n${lesson.statement}\n\n${lesson.parts.map((p, i) => `（${i + 1}）${p.task}\n答案：${p.answer}\n推导：${p.proof}`).join("\n\n")}`;
    try { await navigator.clipboard.writeText(text); setCopied("已复制原题条件与各问推导"); }
    catch { setCopied("复制未成功，请选择题干和推导文字后复制"); }
  };
  return <section className={styles.root} aria-label="武汉中考与湖北高考真题探究">
    {!embedded && <div className={styles.cases} role="group" aria-label="选择本地卷真题">
      {LOCAL_EXAM_CASES.map(c => <button type="button" key={c.id} aria-pressed={selected === c.id}
        className={selected === c.id ? styles.selected : styles.case}
        onClick={() => { setSelected(c.id); chooseStage(0); }}>
        <span>{c.paper} · {c.question}</span><strong>{c.title}</strong><small>{c.summary}</small>
      </button>)}
    </div>}
    <header className={styles.intro}>
      <div><span className={styles.eyebrow}>{source.topic} / 原卷条件探究</span><h2>{source.title}</h2></div>
      <p>{lesson.statement}</p>
      <p className={styles.source}>核对来源：{source.file} · 第 {source.page} 页 · {source.paper}数学{source.question}。条件按原卷重述；滑块只调整题设允许的动点与待求参数。</p>
    </header>
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={styles.plot} aria-label="真题构型与实时测量">
          <div className={styles.panelHeading}><strong>构型与实时测量</strong><span>横纵等比例 · 数值为近似显示</span></div>
          <ExamDrawing lesson={lesson} title={`${source.paper}${source.question} · ${part.title}`} />
          <div className={styles.readings} aria-live="polite">{lesson.readings.map(r => <div key={r.label}><small>{r.label}</small><strong>{r.value}</strong></div>)}</div>
        </section>
        <section className={styles.question} aria-label="连续小问与解析证明">
          <div className={styles.steps} role="group" aria-label="选择原题小问">{lesson.parts.map((p, i) => <button type="button" key={p.title}
            aria-pressed={stage === i} onClick={() => chooseStage(i)}><span>0{i + 1}</span>{p.title}</button>)}</div>
          <h3>{part.title}</h3><p>{part.task}</p>
          <button className={styles.primary} type="button" onClick={() => setShowProof(v => !v)}>{showProof ? "收起答案与推导" : "查看本问答案与推导"}</button>
          {showProof && <div className={styles.proof}><strong>{part.answer}</strong><p>{part.proof}</p><small>这是基于题设的解析证明；画布上的近似测量用于观察。</small></div>}
          <div className={styles.stepActions}>
            <button type="button" disabled={stage === 0} onClick={() => chooseStage(stage - 1)}>上一问</button>
            <button type="button" disabled={stage === lesson.parts.length - 1} onClick={() => chooseStage(stage + 1)}>下一问 →</button>
            <button type="button" onClick={() => void copy()}>复制完整题设与推导</button>
          </div>{copied && <p role="status">{copied}</p>}
        </section>
      </div>
      <aside className={styles.aside}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><strong>动点与待求条件</strong><button type="button" onClick={() => { changeParameters(LOCAL_EXAM_DEFAULTS[selected]); setShowProof(false); }}>复原参数</button></div>
          {lesson.controls.length === 0 && <p className={styles.muted}>本问先由固定条件求解。下一问会开放相应的动点参数。</p>}
          {lesson.controls.map(c => <label className={styles.control} key={c.key}>
            <span>{c.label}</span><output>{examNumber(input[c.key])}</output>
            <input type="range" aria-label={c.label} min={c.min} max={c.max} step={c.step} value={input[c.key]}
              onChange={e => changeParameters({ [c.key]: Number(e.target.value) })} />
            <input type="number" aria-label={c.label + "数值输入"} min={c.min} max={c.max} step="any" value={input[c.key]}
              onChange={e => { const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n) && n >= c.min && n <= c.max) changeParameters({ [c.key]: n }); }} />
          </label>)}
          <div className={styles.shortcuts}>{lesson.shortcuts.map(s => <button type="button" key={s.label} onClick={() => { changeParameters(s.values); chooseStage(s.stage); }}>{s.label}</button>)}</div>
        </section>
        <section className={styles.panel} aria-label="原题约束检查">
          <h3>原题约束检查</h3>
          <ul className={styles.checks}>{lesson.checks.map(c => <li key={c.label} data-pass={c.pass}><span aria-hidden>{c.pass ? "✓" : "!"}</span><div>{c.label}<small>{c.pass ? "当前满足" : "当前不满足"}</small></div></li>)}</ul>
          {lesson.warning && <p className={styles.warning} role="status">{lesson.warning}</p>}
        </section>
        {lesson.expression && <section className={styles.panel}><h3>继续研究函数</h3><p className={styles.muted}>将同一表达式送入统一函数工具，自由研究图像变换。</p>
          <Link className={styles.toolLink} href={`/math-studio?view=functions&expression=${encodeURIComponent(lesson.expression)}`}>打开当前函数 →</Link></section>}
        {(selected === "hyperbola" || selected === "ellipse") && <Link className={styles.toolLink}
          href={`/math-studio?view=conics&preset=${selected === "hyperbola" ? "hubei2022" : "hubei2025"}`}>在圆锥曲线工具中打开原题曲线 →</Link>}
      </aside>
    </div>
  </section>;
}
