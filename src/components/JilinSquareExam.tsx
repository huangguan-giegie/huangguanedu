"use client";

import {useId,useState} from "react";
import {analyzeSquare,type Point} from "../lib/verified-exam-casebook";
import styles from "./VerifiedExamCasebook.module.css";

const fmt=(n:number)=>Math.abs(n)<1e-8?"0":String(Number(n.toFixed(3)));
function Control({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(n:number)=>void}){
  const id=useId();
  return <div className={styles.slider}>
    <label className={styles.sliderLabel} htmlFor={id}><span>{label}</span><strong>{fmt(value)}</strong></label>
    <div className={styles.sliderPair}>
      <input id={id} type="range" min={min} max={max} step={.5} value={value}
        onChange={e=>onChange(Number(e.target.value))}/>
      <input aria-label={label+"精确输入"} type="number" min={min} max={max} step={.5} value={value}
        onChange={e=>{const n=Number(e.target.value);if(e.target.value&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}}/>
    </div>
  </div>;
}
function SquareFigure({points,clip}:{points:{
    A:Point;B:Point;C:Point;P:Point;D:Point;E:Point;intersection:Point[]
  };clip:string}){
  const {A,B,C,P,D,E,intersection}=points;
  const L=C.x,d=B.x;
  const scale=Math.min(630/L,325/Math.max(L,d),46);
  const project=(p:Point)=>({x:42+p.x*scale,y:363-p.y*scale});
  const pt=(v:Point)=>{const p=project(v);return `${p.x},${p.y}`;};
  const polygon=(p:Point[])=>p.map(pt).join(" ");
  return <svg className={styles.canvas} viewBox="0 0 720 410" role="img"
    aria-label="2025吉林中考几何真题结构：动点P、正方形APDE和三角形ABC的重叠面积图">
    <defs><clipPath id={clip}><rect width="720" height="410"/></clipPath></defs>
    <rect width="720" height="410" fill="#f8fcff"/>
    <g clipPath={`url(#${clip})`}>
      <line x1="0" y1={project(A).y} x2="720" y2={project(A).y} stroke="#9eb2c1" strokeWidth="1.4"/>
      <polygon points={polygon([A,B,C])} fill="#94c9e530" stroke="#2586aa" strokeWidth="3"/>
      <polygon points={polygon([A,P,D,E])} fill="#f7cc9f33" stroke="#d28134" strokeWidth="2.6"/>
      <polygon points={polygon(intersection)} fill="#55b88b73" stroke="#26966e" strokeWidth="2.6"/>
      <line x1={project(B).x} x2={project(B).x} y1={project(B).y} y2={project({x:B.x,y:0}).y}
        stroke="#6c86a2" strokeDasharray="7 5" strokeWidth="1.4"/>
      {([
        {id:"A",p:A},{id:"B",p:B},{id:"C",p:C},{id:"P",p:P},
        {id:"D",p:D},{id:"E",p:E},
      ] as const).map(o=>{const p=project(o.p);return <g key={o.id}>
        <circle cx={p.x} cy={p.y} r="5" fill={o.id==="P"||o.id==="D"||o.id==="E"?"#a46433":"#216584"} stroke="#fff" strokeWidth="1.5"/>
        <text x={p.x+(o.id==="C"?-6:10)} y={p.y+(o.id==="A"?20:-12)}
          fontSize="16" fontWeight="800" fill="#274a61">{o.id}</text>
      </g>;})}
      <text x="428" y="70" fontSize="15" fill="#205c79">蓝：△ABC</text>
      <text x="428" y="97" fontSize="15" fill="#af6b34">橙：运动正方形</text>
      <text x="428" y="124" fontSize="15" fill="#258c6f">绿：实际重叠区域</text>
    </g>
  </svg>;
}
export function JilinSquareExam(){
  const [leg,setLeg]=useState(3),[base,setBase]=useState(7),[movement,setMovement]=useState(4);
  const [part,setPart]=useState(0),[showAnswer,setShowAnswer]=useState(false);
  const clip=useId().replace(/:/g,"");
  const model=analyzeSquare({leg,base,movement});
  const selected=model.parts[part];
  const restore=()=>{setLeg(3);setBase(7);setMovement(4);setPart(0);setShowAnswer(false);};
  const choosePart=(n:number)=>{setPart(n);setShowAnswer(false);};
  return <div className={styles.root}>
    <header className={styles.top}>
      <div className={styles.eyebrow}>2025 吉林中考数学 · 第19题结构复盘</div>
      <h2>相似三角形不是一个比例滑块：它让面积函数产生分段变化。</h2>
      <p>以真实考题的「边长反求 → 移动正方形与三角形重叠面积 → 特殊位置定解」为主线。点击不同小问，变化的是同一套几何条件，不是互不关联的三道习题。</p>
      <a href="https://www.chujuan.cn/paper/view-5591187.shtml" target="_blank" rel="noopener noreferrer"
        className={styles.source}>核对 2025 吉林中考数学原题第19题 ↗</a>
    </header>
    <div className={styles.columns}>
      <div className={styles.left}>
        <section className={styles.diagramCard}>
          <div className={styles.panelTitle}><strong>① 连续运动的几何图形</strong><span>滑动 AP 观察图形分段</span></div>
          <SquareFigure points={model} clip={clip}/>
          <div className={styles.measures}>
            <span>AC = {fmt(model.ac)}</span>
            <span>BC = {fmt(model.bc)}</span>
            <span>AP = {fmt(movement)}，分段点 AP = {fmt(model.switchAt)}</span>
            <span>重叠面积 S = {fmt(model.area)}</span>
          </div>
        </section>
        <section className={styles.questionCard}>
          <div className={styles.panelTitle}><strong>② 按原卷的递进结构逐题证明</strong><span>第 {part+1} / 3 问</span></div>
          <div className={styles.stageTabs} role="group" aria-label="吉林真题几何小问">
            {model.parts.map((step,i)=><button key={i} type="button" aria-pressed={part===i}
              className={part===i?styles.stepActive:styles.step} onClick={()=>choosePart(i)}>第 {i+1} 问</button>)}
          </div>
          <article className={styles.stage}>
            <div className={styles.stageEyebrow}>真实考法 · 数学关系全程复用</div>
            <h3>{selected.title}</h3>
            <p className={styles.problem}>{selected.task}</p>
            <div className={styles.stageTools}>
              <button type="button" onClick={()=>setShowAnswer(!showAnswer)} className={styles.reveal}>
                {showAnswer?"收起本问推导":"查看本问的标准解答"}
              </button>
              <span>代数和相似几何均可证</span>
            </div>
            {showAnswer&&<div className={styles.proof}>
              <strong>{selected.answer}</strong><p>{selected.proof}</p>
            </div>}
          </article>
          <div className={styles.stepNav}>
            <button type="button" disabled={part===0} onClick={()=>choosePart(part-1)}>上一问</button>
            <button type="button" disabled={part===2} onClick={()=>choosePart(part+1)}>下一问 →</button>
          </div>
        </section>
      </div>
      <aside className={styles.right}>
        <section className={styles.editor}>
          <div className={styles.panelTitle}><strong>③ 命题人：控制题设与动点</strong>
            <button type="button" className={styles.reset} onClick={restore}>复原真题参数</button></div>
          <p className={styles.explain}>初始真题几何关系：AB=3√2，BC=5，∠BAC=45°，AC=7。改变数据将产生同构变式，并自动更新各问。</p>
          <Control label="B 的投影高度 d（AB = d√2）" value={leg} min={2} max={5}
            onChange={n=>{setLeg(n);setBase(v=>Math.max(v,2*n+1));setMovement(v=>Math.min(v,Math.max(base,2*n+1)));setShowAnswer(false);}}/>
          <Control label="三角形底边 AC" value={base} min={2*leg+1} max={16}
            onChange={n=>{setBase(n);setMovement(x=>Math.min(x,n));setShowAnswer(false);}}/>
          <Control label="点 P 的行进距离 AP" value={movement} min={.5} max={base}
            onChange={n=>{setMovement(n);setShowAnswer(false);}}/>
          <div className={styles.facts}>
            <strong>三个关键的命题临界值</strong>
            <p>第一临界：AP = {fmt(leg)}，正方形顶点 D 经过三角形顶点 B；面积公式在此处换段。</p>
            <p>第二临界：AP = {fmt(2*leg)}，正方形中心和 B 重合，产生第三问的唯一解。</p>
            <p>最终位置：AP = AC = {fmt(base)}，运动结束，重叠区域变为整个三角形。</p>
          </div>
        </section>
        <section className={styles.auditor}>
          <div className={styles.panelTitle}><strong>④ 对照图形的数学检验</strong></div>
          <p>本题不是任意调整形状：保持 ∠BAC=45°、B=(d,d)、C=(L,0)，由余弦定理与右侧直角相似三角形共同确定分段面积。</p>
          <p>切换点 t={fmt(leg)}：左段与右段面积均为 {fmt(leg*leg/2)}，所以虽然表达式变化，但没有不合理的面积跳跃。</p>
          <p>当前属于 {movement<=leg?"第一段：重叠为三角形 APD":"第二段：用 △ABC 面积减去右端缺口"}。</p>
        </section>
      </aside>
    </div>
    <p className={styles.footer}>原题仅作为结构来源；控制台上的其他参数为经过几何约束校验的原创同构变式，不标注成官方原题。当前案例无后端调用，不改动正式试题和学生数据。</p>
  </div>;
}
