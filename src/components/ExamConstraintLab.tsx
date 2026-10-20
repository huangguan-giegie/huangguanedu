"use client";

import { useId, useState } from "react";
import {
  analyzeCircle, analyzeParabola, analyzeTriangle,
  type ConstraintAnalysis, type ConstraintScenario, type PointTarget, type Point2,
} from "../lib/question-constraint-lab";
import styles from "./ExamConstraintLab.module.css";

const SCENARIOS: { id: ConstraintScenario; title: string; subject: string }[] = [
  { id: "circle", title: "圆上的点", subject: "中考 · 圆与坐标" },
  { id: "parabola", title: "抛物线交点", subject: "高考 · 解析几何" },
  { id: "triangle", title: "动点与定面积", subject: "中考 · 动点不变量" },
];

function NumberControl({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (next: number) => void;
}) {
  const id = useId();
  return <div className={styles.numberControl}>
    <div className={styles.controlHeading}><label htmlFor={id}>{label}</label><output>{value}</output></div>
    <input id={id} type="range" min={min} max={max} step={1} value={value}
      onChange={event => onChange(Number(event.target.value))}/>
  </div>;
}

function Axis({ toScreen, xMin, xMax, yMin, yMax }: {
  toScreen: (p: Point2) => Point2;
  xMin: number; xMax: number; yMin: number; yMax: number;
}) {
  const xs = Array.from({ length: xMax-xMin+1 }, (_, i) => xMin+i);
  const ys = Array.from({ length: yMax-yMin+1 }, (_, i) => yMin+i);
  return <g>
    {xs.map(x => {const p=toScreen({x,y:0}); return <line key={x} x1={p.x} x2={p.x} y1="0" y2="420"
      stroke={x===0?"#829bad":"#dfebf1"} strokeWidth={x===0?1.8:.65}/>;})}
    {ys.map(y => {const p=toScreen({x:0,y}); return <line key={y} x1="0" x2="720" y1={p.y} y2={p.y}
      stroke={y===0?"#829bad":"#dfebf1"} strokeWidth={y===0?1.8:.65}/>;})}
  </g>;
}

function MathCanvas({ scenario, analysis, radius, y, lockY, positiveX, p, x, lockX, positiveY,
  base, height, triangleX, lockHeight, lockTriangleX }: {
  scenario: ConstraintScenario; analysis: ConstraintAnalysis;
  radius: number; y: number; lockY: boolean; positiveX: boolean;
  p: number; x: number; lockX: boolean; positiveY: boolean;
  base: number; height: number; triangleX: number; lockHeight: boolean; lockTriangleX: boolean;
}) {
  const clipId = useId().replace(/:/g, "");
  const circle = scenario==="circle";
  const triangle = scenario==="triangle";
  const toScreen = (q: Point2): Point2 => triangle
    ? { x: 220+q.x*32, y: 347-q.y*32 }
    : circle ? { x: 360+q.x*28, y: 210-q.y*28 }
      : { x: 138+q.x*20, y: 210-q.y*20 };
  const parabolaCurve = Array.from({length:201},(_,i)=>{
    const yy=-10+i/10;return toScreen({x:yy*yy/(4*p),y:yy});
  }).map((q,i)=>`${i?"L":"M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(" ");
  const c = toScreen({ x: triangleX, y: height });
  const a = toScreen({x:0,y:0});
  const b = toScreen({x:base,y:0});
  const ref = scenario==="triangle" ? "A、B 固定，C 为示例位置。虚线表示当前锁定的几何条件。"
    : "蓝色为原始轨迹，橙色为附加等式约束；实心点为全部可行离散解。";
  return <div className={styles.plotWrap}>
    <svg viewBox="0 0 720 420" role="img" aria-label={`命题几何画布：${ref}`} className={styles.plot}>
      <defs><clipPath id={clipId}><rect width="720" height="420"/></clipPath></defs>
      <rect width="720" height="420" fill="#f9fcff"/>
      <Axis toScreen={toScreen} xMin={triangle?-6:circle?-7:-6} xMax={triangle?15:circle?7:30}
        yMin={-11} yMax={11}/>
      <g clipPath={`url(#${clipId})`}>
        {circle&&<>
          <circle cx="360" cy="210" r={radius*28} fill="none" stroke="#188ba6" strokeWidth="3.4"/>
          {positiveX&&<path d={`M360 ${210-radius*28} A${radius*28} ${radius*28} 0 0 1 360 ${210+radius*28}`}
            fill="none" stroke="#087986" strokeWidth="5" strokeLinecap="round"/>}
          {lockY&&<line x1="0" x2="720" y1={toScreen({x:0,y}).y} y2={toScreen({x:0,y}).y}
            stroke="#ed9258" strokeWidth="2.8" strokeDasharray="8 6"/>}
          {positiveX&&<rect x="0" y="0" width="360" height="420" fill="#fff" fillOpacity=".32"/>}
        </>}
        {scenario==="parabola"&&<>
          <path d={parabolaCurve} fill="none" stroke="#188ba6" strokeWidth="3.5"/>
          {positiveY&&<path d={Array.from({length:101},(_,i)=>{
            const yy=i/10;const q=toScreen({x:yy*yy/(4*p),y:yy});
            return `${i?"L":"M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
          }).join(" ")} stroke="#087986" strokeWidth="5" fill="none"/>}
          {lockX&&<line x1={toScreen({x,y:0}).x} x2={toScreen({x,y:0}).x} y1="0" y2="420"
            stroke="#ed9258" strokeWidth="2.8" strokeDasharray="8 6"/>}
        </>}
        {triangle&&<>
          {lockHeight&&<line x1="0" x2="720" y1={c.y} y2={c.y}
            stroke="#ed9258" strokeWidth="2.7" strokeDasharray="8 6"/>}
          {lockTriangleX&&<line x1={c.x} x2={c.x} y1="0" y2="420"
            stroke="#9a70c7" strokeWidth="2.4" strokeDasharray="7 6"/>}
          <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`}
            fill="#54adbc28" stroke="#188ba6" strokeWidth="3" strokeLinejoin="round"/>
          <line x1={c.x} y1={c.y} x2={c.x} y2={a.y} stroke="#ed9258" strokeDasharray="6 5" strokeWidth="2"/>
          {[{q:a,text:"A"},{q:b,text:"B"},{q:c,text:"C"}].map(({q,text})=><g key={text}>
            <circle cx={q.x} cy={q.y} r="5" fill="#196884"/>
            <text x={q.x+10} y={q.y-12} fill="#234765" fontSize="17" fontWeight="700">{text}</text>
          </g>)}
          <text x={Math.min(690,Math.max(16,(a.x+b.x)/2-20))} y={a.y+26} fill="#244761" fontSize="16">AB = {base}</text>
          {lockHeight&&<text x={c.x+10} y={c.y+22} fill="#a66028" fontSize="14">h = {height}</text>}
        </>}
        {!triangle&&analysis.points.map((pt,i)=>{
          const q=toScreen(pt);
          return <g key={i}>
            <circle cx={q.x} cy={q.y} r="6.5" fill="#e1874e" stroke="white" strokeWidth="2"/>
            <text x={q.x+11} y={q.y-13} fill="#8c4c29" fontSize="14" fontWeight="700">
              {i===0?"P₁":"P₂"} ({Number(pt.x.toFixed(2))}, {Number(pt.y.toFixed(2))})
            </text>
          </g>;
        })}
      </g>
    </svg>
    <div className={styles.plotCaption}>{ref}</div>
  </div>;
}

const STATUS_TEXT: Record<ConstraintAnalysis["status"], string> = {
  continuous: "无穷多个构型",
  none: "条件矛盾 / 无解",
  unique: "唯一构型或唯一点",
  multiple: "多个离散解",
};

export function ExamConstraintLab() {
  const [scenario,setScenario]=useState<ConstraintScenario>("circle");
  const [radius,setRadius]=useState(5);
  const [y,setY]=useState(3);
  const [lockY,setLockY]=useState(false);
  const [positiveX,setPositiveX]=useState(false);
  const [p,setP]=useState(1);
  const [x,setX]=useState(4);
  const [lockX,setLockX]=useState(false);
  const [positiveY,setPositiveY]=useState(false);
  const [target,setTarget]=useState<PointTarget>("point");
  const [base,setBase]=useState(6);
  const [height,setHeight]=useState(4);
  const [triangleX,setTriangleX]=useState(2);
  const [lockHeight,setLockHeight]=useState(false);
  const [lockTriangleX,setLockTriangleX]=useState(false);
  const [showQuestion,setShowQuestion]=useState(false);
  const [copyStatus,setCopyStatus]=useState("");

  const analysis = scenario==="circle"
    ? analyzeCircle({radius,y,lockY,positiveX,target})
    : scenario==="parabola"
      ? analyzeParabola({p,x,lockX,positiveY,target})
      : analyzeTriangle({base,height,x:triangleX,lockHeight,lockX:lockTriangleX});
  const targetLabel = scenario==="triangle" ? "△ABC 的面积" : target==="square"
    ? scenario==="circle" ? "x²" : "y²" : "点 P 的坐标";
  const reset = () => {
    setRadius(5);setY(3);setLockY(false);setPositiveX(false);
    setP(1);setX(4);setLockX(false);setPositiveY(false);setTarget("point");
    setBase(6);setHeight(4);setTriangleX(2);setLockHeight(false);setLockTriangleX(false);
    setShowQuestion(false);setCopyStatus("");
  };
  const copyQuestion = () => {
    if(!analysis.question)return;
    const {question,answer,explanation}=analysis.question;
    void navigator.clipboard.writeText(`${question}\n\n标准答案：${answer}\n解析：${explanation}`)
      .then(()=>setCopyStatus("题干、答案与解析已复制"))
      .catch(()=>setCopyStatus("浏览器拒绝复制，请手动选择题目文字"));
  };
  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.eyebrow}>EXAM DESIGN LAB / 数学命题实验室</div>
      <h1>改变条件，观察一道题如何变得可解。</h1>
      <p>从连续解空间出发，逐步加入等式和不等式条件。区分「图形唯一」和「目标量唯一」，并用同一组数学参数生成题干、图形与标准答案。</p>
      <span>本阶段内置三类可完整求解的命题模型，不是任意几何约束的通用证明器。</span>
    </header>

    <div className={styles.scenarioTabs} role="group" aria-label="选择命题场景">
      {SCENARIOS.map(item=><button key={item.id} type="button" aria-pressed={scenario===item.id}
        className={scenario===item.id?styles.activeTab:styles.tab}
        onClick={()=>{setScenario(item.id);setShowQuestion(false);setCopyStatus("");}}>
        <strong>{item.title}</strong><small>{item.subject}</small>
      </button>)}
    </div>
    <div className={styles.mainGrid}>
      <section className={styles.visual}>
        <div className={styles.panelHead}><div><strong>01 · 解空间实时演示</strong>
          <p>蓝色是原始几何关系，增加条件后可行解自动更新。</p></div></div>
        <MathCanvas scenario={scenario} analysis={analysis} radius={radius} y={y} lockY={lockY}
          positiveX={positiveX} p={p} x={x} lockX={lockX} positiveY={positiveY}
          base={base} height={height} triangleX={triangleX} lockHeight={lockHeight}
          lockTriangleX={lockTriangleX}/>
        <div className={styles.summary}>
          <div><small>当前解空间</small><strong>{STATUS_TEXT[analysis.status]}</strong></div>
          <div><small>构型自由度</small><strong>{analysis.degreesOfFreedom===null?"不可定义":analysis.degreesOfFreedom}</strong></div>
          <div><small>目标「{targetLabel}」</small><strong className={analysis.targetUnique?styles.good:styles.warning}>
            {analysis.targetUnique?"已唯一确定":"尚未定解"}</strong></div>
        </div>
        {analysis.targetUnique&&<div className={styles.result} aria-live="polite">
          <span>确定的目标值</span><strong>{analysis.targetValue}</strong>
        </div>}
      </section>

      <aside className={styles.controls}>
        <div className={styles.controlCard}>
          <div className={styles.panelHead}><strong>02 · 设计已知条件</strong>
            <button className={styles.reset} type="button" onClick={reset}>重置全部条件</button>
          </div>
          {scenario==="circle"&&<>
            <NumberControl label="圆的半径 r" value={radius} min={1} max={6} onChange={setRadius}/>
            <NumberControl label="水平截线 y 的位置" value={y} min={-7} max={7} onChange={setY}/>
            <label className={styles.check}><input type="checkbox" checked={lockY}
              onChange={e=>setLockY(e.target.checked)}/> 已知：y = {y}</label>
            <label className={styles.check}><input type="checkbox" checked={positiveX}
              onChange={e=>setPositiveX(e.target.checked)}/> 限定：x &gt; 0</label>
          </>}
          {scenario==="parabola"&&<>
            <NumberControl label="焦点参数 p（y²=4px）" value={p} min={1} max={3} onChange={setP}/>
            <NumberControl label="竖直截线 x 的位置" value={x} min={-4} max={9} onChange={setX}/>
            <label className={styles.check}><input type="checkbox" checked={lockX}
              onChange={e=>setLockX(e.target.checked)}/> 已知：x = {x}</label>
            <label className={styles.check}><input type="checkbox" checked={positiveY}
              onChange={e=>setPositiveY(e.target.checked)}/> 限定：y &gt; 0</label>
          </>}
          {scenario==="triangle"&&<>
            <NumberControl label="底边 AB" value={base} min={2} max={9} onChange={setBase}/>
            <NumberControl label="顶点 C 的示例高度" value={height} min={1} max={7} onChange={setHeight}/>
            <label className={styles.check}><input type="checkbox" checked={lockHeight}
              onChange={e=>setLockHeight(e.target.checked)}/> 已知：C 到 AB 的距离 = {height}</label>
            <NumberControl label="顶点 C 的示例横坐标" value={triangleX} min={-5} max={8} onChange={setTriangleX}/>
            <label className={styles.check}><input type="checkbox" checked={lockTriangleX}
              onChange={e=>setLockTriangleX(e.target.checked)}/> 已知：C 的横坐标 = {triangleX}</label>
          </>}
          {scenario!=="triangle"&&<label className={styles.target}>命题目标
            <select value={target} onChange={event=>setTarget(event.target.value as PointTarget)}>
              <option value="point">求点 P 的坐标</option>
              <option value="square">求{scenario==="circle"?" x²":" y²"} 的值</option>
            </select>
          </label>}
          <div className={styles.conditionList}><strong>题设条件</strong>
            <ol>{analysis.conditions.map((item,i)=><li key={i}>{item}</li>)}</ol>
          </div>
        </div>
        <div className={styles.controlCard}>
          <div className={styles.panelHead}><strong>03 · 命题检验报告</strong></div>
          <div className={styles.notes} aria-live="polite">
            {analysis.notes.map((note,i)=><p key={i}>{note}</p>)}
          </div>
          <button className={styles.generate} disabled={!analysis.question} type="button"
            onClick={()=>{setShowQuestion(!showQuestion);setCopyStatus("");}}>
            {showQuestion?"收起试题预览":"根据当前条件生成一道题"}
          </button>
          {!analysis.question&&<p className={styles.help}>只有待求量存在且唯一时，才能生成带有可信标准答案的试题。</p>}
        </div>
      </aside>
    </div>

    {showQuestion&&analysis.question&&<section className={styles.question} aria-label="已验证的考试题预览">
      <div className={styles.panelHead}><div><strong>04 · 已验证试题</strong><p>{analysis.question.level} · 参数驱动生成</p></div>
        <button type="button" onClick={copyQuestion} className={styles.reset}>复制题目与解析</button></div>
      <p className={styles.questionText}>{analysis.question.question}</p>
      <details><summary>查看标准答案及完整推导</summary>
        <p><strong>标准答案：</strong>{analysis.question.answer}</p>
        <p><strong>解析：</strong>{analysis.question.explanation}</p>
      </details>
      {copyStatus&&<p className={styles.help} role="status">{copyStatus}</p>}
    </section>}
    <p className={styles.disclaimer}>所有条件校验与题目生成均在本地数学函数中进行；本实验不上传或修改学生的正式试卷、答案及成绩。自由度是当前规范化坐标下的构型自由度，不等同于任意非线性约束系统的全局秩分析。</p>
  </div>;
}
