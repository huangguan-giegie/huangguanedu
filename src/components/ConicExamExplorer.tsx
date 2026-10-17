"use client";
import {useState} from "react";
import {
 conicCurves,conicFoci,conicEquation,intersectConicLine,conicExamFacts,throughPointLine,
 type ConicKind,type ConicModel,type Secant,type V2,
} from "../lib/exam-conics";
import styles from "./ExamExplorer.module.css";

const W=720,H=440,S=30;
const project=(p:V2)=>({x:W/2+p.x*S,y:H/2-p.y*S});
const samplePath=(points:V2[])=>points.map((p,i)=>{
 const c=project(p);
 return `${i===0?"M":"L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
}).join(" ");
const MODES:{id:ConicKind;label:string;topic:string}[]=[
 {id:"ellipse",label:"椭圆",topic:"椭圆焦点、离心率、直线与椭圆的位置关系"},
 {id:"hyperbola",label:"双曲线",topic:"双曲线渐近线、焦点、直线交点判别"},
 {id:"parabola",label:"抛物线",topic:"抛物线焦点与准线、弦长及过点的直线"},
];
const statusText={secant:"两个交点 · 割线",tangent:"一个重交点 · 相切",none:"没有实交点", "single-not-tangent":"仅一个交点，但不相切",coincident:"退化方程"} as const;
export function ConicExamExplorer({compact=false}:{compact?:boolean}){
 const [kind,setKind]=useState<ConicKind>("ellipse");
 const [a,setA]=useState(4),[b,setB]=useState(2),[p,setP]=useState(1.5);
 const [m,setM]=useState(.5),[px,setPx]=useState(0),[py,setPy]=useState(0);
 const c:ConicModel={kind,a,b,p};
 const line:Secant={point:{x:px,y:py},slope:m};
 const result=intersectConicLine(c,line);
 const foci=conicFoci(c);
 const formula=conicEquation(c);
 const facts=conicExamFacts(c,line);
 const opts=MODES.find(x=>x.id===kind)!;
 const preset=(type:ConicKind)=>{
  setKind(type);setA(4);setB(2);setP(1.5);setM(type==="parabola"?1:.5);setPx(0);setPy(0);
 };
 return <div className={styles.explorer}>
  <header className={styles.heading}><div><strong>高考解析几何 · 圆锥曲线</strong>
   <p>椭圆、双曲线、抛物线均在 x-y 平面内；将直线 y−y₀=k(x−x₀) 与曲线联立，判断割线、相切或不相交。</p></div></header>
  <div className={styles.presets}>{MODES.map(opt=><button key={opt.id} type="button" aria-pressed={kind===opt.id}
   onClick={()=>preset(opt.id)}>{opt.label}</button>)}</div>
  <div className={styles.layout}>
   <div className={styles.plot}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${opts.label} ${formula}，过P的直线和交点`}>
     <defs><clipPath id="conic-graph-clip"><rect width={W} height={H}/></clipPath></defs>
     <rect width={W} height={H} fill="#f9fcff"/>
     {Array.from({length:25},(_,i)=>i-12).map(i=><g key={i} stroke={i===0?"#8193ac":"#e1eaf2"} strokeWidth={i===0?1.8:1}>
      <line x1={project({x:i,y:0}).x} x2={project({x:i,y:0}).x} y1="0" y2={H}/>
      <line x1="0" x2={W} y1={project({x:0,y:i}).y} y2={project({x:0,y:i}).y}/>
     </g>)}
     <g clipPath="url(#conic-graph-clip)">
      {kind==="hyperbola"&&[-1,1].map(n=><path key={n} strokeDasharray="6 5" stroke="#93a7ba" strokeWidth="1.4"
       d={samplePath([{x:-12,y:n*-12*b/a},{x:12,y:n*12*b/a}])}/>)}
      {conicCurves(c).map((curve,i)=><path key={i} d={samplePath(curve)} stroke="#178aa4" strokeWidth="3" fill="none"/>)}
      <path d={samplePath([{x:-13,y:py+m*(-13-px)},{x:13,y:py+m*(13-px)}])}
       stroke="#f18e51" strokeWidth="2.6" fill="none"/>
      {foci.map((f,i)=>{const pos=project(f);return <g key={i}>
       <circle cx={pos.x} cy={pos.y} r="4" fill="#7c6ac1"/>
       <text x={pos.x+8} y={pos.y-8} fontSize="14" fill="#7051a2">F{i+1}</text>
      </g>;})}
      {result.points.filter(q=>Math.abs(q.x)<12&&Math.abs(q.y)<8).map((q,i)=>{
       const v=project(q);return <g key={i}><circle cx={v.x} cy={v.y} r="5.5" stroke="white" strokeWidth="2" fill="#e37734"/>
        <text x={v.x+9} y={v.y-10} fontSize="15" fill="#784824">{i===0?"A":"B"}</text></g>;
      })}
      {(()=>{const q=project(line.point);return <g><circle cx={q.x} cy={q.y} r="5" fill="#234f7a"/>
       <text x={q.x+8} y={q.y-8} fontSize="15" fill="#244666">P</text></g>;})()}
     </g>
     <text x="690" y="211" fontSize="15" fill="#415776">x</text>
     <text x="370" y="18" fontSize="15" fill="#415776">y</text>
    </svg>
    <small>蓝色：圆锥曲线；橙色：过 P 的直线；紫色：焦点；橙点：实交点。方程与图形共用同一参数。</small>
   </div>
   <div className={styles.controls}>
    <strong className={styles.formula}>{formula}</strong>
    {kind!=="parabola"?<>
     <label>半长轴 / 实半轴 a = {a.toFixed(1)}<input type="range" min="2.5" max="6" step=".5" value={a} onChange={e=>setA(Number(e.target.value))}/></label>
     <label>半短轴 / 虚半轴 b = {b.toFixed(1)}<input type="range" min=".5" max="2" step=".5" value={b} onChange={e=>setB(Number(e.target.value))}/></label>
    </>:<label>焦点参数 p = {p.toFixed(1)}<input type="range" min=".5" max="3" step=".5" value={p} onChange={e=>setP(Number(e.target.value))}/></label>}
    <label>过点 P 的横坐标 x₀：{px.toFixed(1)}<input type="range" min="-5" max="5" step=".25" value={px} onChange={e=>setPx(Number(e.target.value))}/></label>
    <label>过点 P 的纵坐标 y₀：{py.toFixed(1)}<input type="range" min="-4" max="4" step=".25" value={py} onChange={e=>setPy(Number(e.target.value))}/></label>
    <label>直线斜率 k：{m.toFixed(2)}<input type="range" min="-3" max="3" step=".05" value={m} onChange={e=>setM(Number(e.target.value))}/></label>
    <section className={styles.facts} aria-live="polite">
     <h3>{opts.topic}</h3>
     <p className={styles.formula}>{throughPointLine(line).equation}</p>
     <strong>{statusText[result.status]}</strong>
     {facts.map((fact,i)=><p key={i}>{fact}</p>)}
     <p>{kind==="ellipse"?"焦距满足 c²=a²−b²，0<e<1。":kind==="hyperbola"?"焦距满足 c²=a²+b²，渐近线 y=±(b/a)x。":"焦点 F(p,0)，准线 x=−p，离心率为1。"}</p>
    </section>
    <section className={styles.facts} aria-label="高考解析几何典型例题">
     <h3>高考常考题型 · 点击展开解答</h3>
     {[
      {question:"题型一：根据参数，求标准方程、焦点与离心率。",answer:`${formula}；${facts[1]}；${facts[2]}`},
      {question:`题型二：直线经过 P(${px}, ${py})，斜率为 ${m.toFixed(2)}，写出直线方程。`,answer:throughPointLine(line).equation},
      {question:"题型三：判断直线与圆锥曲线有几个交点，是否相切。",answer:`${statusText[result.status]}；代入判别式 Δ = ${result.discriminant.toFixed(5)}。`},
      {question:"题型四：求该直线在曲线上截出的弦长。",answer:result.chord===null?"当前直线不存在两个不同的有限交点，无法组成弦。":`由两点距离公式，弦长 = ${result.chord.toFixed(4)}。`},
     ].map((q,i)=><details key={i} style={{padding:"9px 0",borderBottom:"1px solid var(--line)"}}>
      <summary style={{cursor:"pointer",fontWeight:750}}>{q.question}</summary>
      <p style={{padding:"10px 0",lineHeight:1.8}}>解答：{q.answer}</p>
     </details>)}
    </section>
    {!compact&&<p className={styles.tip}>高考常见题型：求标准方程及焦点、离心率、已知点是否在曲线上、过指定点的直线与曲线的交点个数、相切条件、弦长和韦达定理。这里的斜率控制不能表示竖直线 x=x₀。</p>}
   </div>
  </div>
 </div>;
}
