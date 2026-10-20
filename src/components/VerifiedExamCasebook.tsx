"use client";

import {useId,useState} from "react";
import {
  analyzeJilin,analyzeGaokao,
  type JilinOutput,type GaokaoOutput,type ExamStep,type Point,
} from "../lib/verified-exam-casebook";
import styles from "./VerifiedExamCasebook.module.css";

type CaseId="jilin"|"gaokao";
const SOURCES={
  jilin:{
    title:"2025 吉林中考数学 · 第22题",
    url:"https://www.chujuan.cn/paper/view-5591187.shtml",
    note:"四问递进：函数表达式 → 面积定值 → 特殊位置多解 → 动点与单调性分类",
  },
  gaokao:{
    title:"2024 新高考Ⅰ卷数学 · 椭圆解答题",
    url:"https://www.scribd.com/document/934951685/2024%E6%96%B0%E9%AB%98%E8%80%83I%E5%8D%B7%E6%95%B0%E5%AD%A6%E8%AF%95%E9%A2%98%E5%8F%8A%E7%AD%94%E6%A1%88",
    note:"两问递进：由已知点反求曲线 → 面积约束反推直线（可能多解）",
  },
} as const;
const fmt=(n:number)=>Math.abs(n)<1e-8?"0":String(Number(n.toFixed(3)));
function Slider({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void}){
  const id=useId();
  return <div className={styles.slider}>
    <label htmlFor={id} className={styles.sliderLabel}><span>{label}</span><strong>{fmt(value)}</strong></label>
    <div className={styles.sliderPair}>
      <input id={id} aria-label={label} type="range" value={value} min={min} max={max} step={step}
        onChange={e=>onChange(Number(e.target.value))}/>
      <input aria-label={label+"数值输入"} type="number" value={value} min={min} max={max} step={step}
        onChange={e=>{if(!e.target.value)return;const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}}/>
    </div>
  </div>;
}
function MathAxes({project}:{project:(p:Point)=>Point}){
  const zero=project({x:0,y:0}),x0=project({x:-100,y:0}),x1=project({x:100,y:0});
  const y0=project({x:0,y:-100}),y1=project({x:0,y:100});
  return <g stroke="#8ba6ba" strokeWidth="1.4" opacity=".85">
    <line x1={x0.x} y1={zero.y} x2={x1.x} y2={zero.y}/>
    <line x1={zero.x} y1={y0.y} x2={zero.x} y2={y1.y}/>
  </g>;
}
function Label({point,project,label,color="#20516e",dx=10,dy=-12}:{point:Point;project:(p:Point)=>Point;label:string;color?:string;dx?:number;dy?:number}){
  const pos=project(point);
  return <g><circle cx={pos.x} cy={pos.y} r="5.5" fill={color} stroke="#fff" strokeWidth="1.8"/>
    <text x={pos.x+dx} y={pos.y+dy} fontSize="15" fontWeight="800" fill={color}>{label}</text></g>;
}
function JilinDiagram({value}:{value:JilinOutput}){
  const clip=useId().replace(/:/g,"");
  const {point:P,other:Q,corner:M,vertex:V,curve}=value;
  const m=[P,Q,M,V,{x:0,y:0}];
  const lowX=Math.min(...m.map(p=>p.x))-1.4,highX=Math.max(...m.map(p=>p.x))+1.4;
  const sampled=Array.from({length:181},(_,i)=>{const x=lowX+i*(highX-lowX)/180;return {x,y:curve(x)};});
  const pts=[...m,...sampled];
  const lowY=Math.min(...pts.map(p=>p.y))-1.2,highY=Math.max(...pts.map(p=>p.y))+1.2;
  const scale=Math.min(630/(highX-lowX),350/(highY-lowY));
  const project=(p:Point)=>({x:360+(p.x-(lowX+highX)/2)*scale,y:206-(p.y-(lowY+highY)/2)*scale});
  const path=sampled.map((p,i)=>{const q=project(p);return `${i?"L":"M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;}).join(" ");
  const pp=project(P),qq=project(Q),mm=project(M);
  const mids=value.insideIntervals.flatMap(([x0,x1])=>{
    return [project({x:x0,y:curve(x0)}),project({x:x1,y:curve(x1)})];
  });
  return <svg className={styles.canvas} viewBox="0 0 720 410" role="img" aria-label="2025吉林中考真题同构图：动点P，反向延长点Q，直角顶点M和抛物线顶点V">
    <defs><clipPath id={clip}><rect width="720" height="410"/></clipPath></defs>
    <rect width="720" height="410" fill="#f8fcff"/>
    <g clipPath={`url(#${clip})`}>
      <MathAxes project={project}/>
      <path d={path} stroke="#2787ac" strokeWidth="3" fill="none"/>
      <polygon points={`${pp.x},${pp.y} ${qq.x},${qq.y} ${mm.x},${mm.y}`}
        fill="#f7cb9854" stroke="#d07832" strokeWidth="2.7"/>
      <line x1={pp.x} y1={pp.y} x2={qq.x} y2={qq.y} stroke="#a96235" strokeWidth="2.6"/>
      <line x1={project({x:0,y:-100}).x} x2={project({x:0,y:100}).x} y1="0" y2="410"
        stroke="#6e7eb0" strokeWidth="1.7" strokeDasharray="7 5"/>
      <path d={path} stroke="#2787ac" strokeWidth="2.1" fill="none"/>
      {mids.length>0&&value.insideIntervals.map(([x0,x1],i)=>{
        const section=Array.from({length:22},(_,j)=>{const x=x0+(x1-x0)*j/21;return project({x,y:curve(x)});});
        return <path key={i} d={section.map((pt,j)=>`${j?"L":"M"}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ")}
          stroke="#2b9c76" strokeWidth="5" fill="none"/>;
      })}
      <Label point={P} project={project} label="P" color="#bd6429"/>
      <Label point={Q} project={project} label="Q" color="#bd6429"/>
      <Label point={M} project={project} label="M" color="#bd6429"/>
      <Label point={V} project={project} label="V（顶点）"/>
      <Label point={{x:0,y:0}} project={project} label="O" dx={8} dy={19}/>
    </g>
  </svg>;
}
function EllipseDiagram({value}:{value:GaokaoOutput}){
  const clip=useId().replace(/:/g,"");
  const a2=Math.max(1,value.P.x*value.P.x/(1-(value.P.y/value.A.y)**2));
  const b2=value.A.y**2;
  const a=Math.sqrt(a2),b=Math.sqrt(b2);
  const map=(p:Point)=>({x:360+p.x*270/(a+1),y:205-p.y*171/(b+.5)});
  const c=map({x:0,y:0});
  const ellipsePoints=Array.from({length:241},(_,i)=>{const t=i*Math.PI/120;return map({x:a*Math.cos(t),y:b*Math.sin(t)});});
  const path=ellipsePoints.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return <svg viewBox="0 0 720 410" className={styles.canvas} role="img"
    aria-label="2024新高考Ⅰ卷椭圆面积反推直线的解空间示意图">
    <defs><clipPath id={clip}><rect width="720" height="410"/></clipPath></defs>
    <rect width="720" height="410" fill="#f8fcff"/>
    <g clipPath={`url(#${clip})`}>
      <line x1="0" x2="720" y1={c.y} y2={c.y} stroke="#8ba6ba" strokeWidth="1.3"/>
      <line x1={c.x} x2={c.x} y1="0" y2="410" stroke="#8ba6ba" strokeWidth="1.3"/>
      <path d={path} fill="#e8f4fa" stroke="#2787ac" strokeWidth="3"/>
      {value.candidateLines.map((line,i)=>line.points.map((B,j)=>{
        const p=map(value.P),q=map(B),o=map(value.A);
        return <g key={`${i}-${j}`}>
          <polygon points={`${o.x},${o.y} ${p.x},${p.y} ${q.x},${q.y}`}
            fill={i===0?"#f8b97929":"#956ec629"}/>
          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={i===0?"#db7b32":"#956ec6"} strokeWidth="2.3"/>
          <Label point={B} project={map} label={`B${i+1}-${j+1}`} color={i===0?"#b9662e":"#795aaf"}/>
        </g>;
      }))}
      <path d={path} fill="none" stroke="#2787ac" strokeWidth="2.7"/>
      <Label point={value.A} project={map} label="A" dx={9} dy={-14}/>
      <Label point={value.P} project={map} label="P" dx={9} dy={-14}/>
      <Label point={{x:0,y:0}} project={map} label="O" dx={8} dy={19}/>
    </g>
  </svg>;
}
function QuestionStage({step,index,total}:{step:ExamStep;index:number;total:number}){
  const [revealed,setRevealed]=useState(false);
  // Keying by stage in the caller unmounts old answers when the user changes stages.
  return <article className={styles.stage}>
    <div className={styles.stageEyebrow}>逐问推导 · 第 {index+1} / {total} 关</div>
    <h3>{step.title}</h3>
    <p className={styles.problem}>{step.task}</p>
    <div className={styles.stageTools}>
      <button type="button" className={styles.reveal} onClick={()=>setRevealed(v=>!v)}>
        {revealed?"收起答案与证明":"查看这一问的标准推导"}
      </button>
      <span>{step.kind==="proved"?"代数/几何可证":"当前参数探索"}</span>
    </div>
    {revealed&&<section className={styles.proof}>
      <strong>{step.answer}</strong>
      <p>{step.proof}</p>
    </section>}
  </article>;
}
export function VerifiedExamCasebook(){
  const [selected,setSelected]=useState<CaseId>("jilin");
  const [stage,setStage]=useState(0);
  const [knownX,setKnownX]=useState(2),[knownY,setKnownY]=useState(-1);
  const [ratio,setRatio]=useState(2),[movingX,setMovingX]=useState(-.5);
  const [majorSquared,setMajorSquared]=useState(12),[minorSquared,setMinorSquared]=useState(9);
  const [pointAngle,setPointAngle]=useState(30),[area,setArea]=useState(9);
  const jl=analyzeJilin({knownX,knownY,ratio,movingX});
  const gc=analyzeGaokao({majorSquared,minorSquared,pointAngle,area});
  const data=selected==="jilin"?jl:gc;
  const steps=data.parts;
  const active=Math.min(stage,steps.length-1);
  const reset=()=>{
    if(selected==="jilin"){setKnownX(2);setKnownY(-1);setRatio(2);setMovingX(-.5);}
    else{setMajorSquared(12);setMinorSquared(9);setPointAngle(30);setArea(9);}
    setStage(0);
  };
  return <div className={styles.root}>
    <header className={styles.top}>
      <div className={styles.eyebrow}>VERIFIED EXAM CASEBOOK · 真题命题拆解</div>
      <h2>一题多问：从原卷条件到可控的命题变式</h2>
      <p>真题复盘保留原题逻辑，调整参数后得到同构新题。这里区分「已证明的答案」「数值条件分类」和「尚未完成的全范围证明」，避免把单次画图误当作数学结论。</p>
      <div className={styles.caseTabs} role="group" aria-label="真题案例">
        {(["jilin","gaokao"] as const).map(id=><button key={id} aria-pressed={selected===id}
          className={selected===id?styles.caseActive:styles.caseTab} type="button"
          onClick={()=>{setSelected(id);setStage(0);}}>
          <strong>{SOURCES[id].title}</strong><small>{SOURCES[id].note}</small>
        </button>)}
      </div>
      <a href={SOURCES[selected].url} target="_blank" rel="noopener noreferrer" className={styles.source}>
        查看真题及原始解答来源 ↗
      </a>
    </header>

    <div className={styles.columns}>
      <div className={styles.left}>
        <section className={styles.diagramCard}>
          <div className={styles.panelTitle}><strong>① 随题设实时更新的几何画布</strong><span>蓝：曲线 · 橙：构造 · 绿：内部弧段</span></div>
          {selected==="jilin"?<JilinDiagram value={jl}/>:<EllipseDiagram value={gc}/>}
          <div className={styles.measures}>
            {selected==="jilin"?<>
              <span>抛物线顶点 V({fmt(jl.vertex.x)}, {fmt(jl.vertex.y)})</span>
              <span>P({fmt(jl.point.x)}, {fmt(jl.point.y)})</span>
              <span>Q({fmt(jl.other.x)}, {fmt(jl.other.y)})</span>
              <span>三角形：{jl.validTriangle?"有效":"退化，需移动P"}</span>
            </>:<>
              <span>椭圆：{gc.equation}</span>
              <span>e = {fmt(gc.eccentricity)}</span>
              <span>合格交点 B 数：{gc.candidates.length}</span>
              <span>独立面积分支：{gc.candidateLines.filter(l=>l.points.length).length}</span>
            </>}
          </div>
        </section>
        <section className={styles.questionCard}>
          <div className={styles.panelTitle}><strong>② 真题的多问递进（当前可逐关检查）</strong>
            <span>{active+1} / {steps.length}</span></div>
          <div className={styles.stageTabs} role="group" aria-label="选择考试小问">
            {steps.map((s,i)=><button key={i} type="button" aria-pressed={active===i}
              className={active===i?styles.stepActive:styles.step} onClick={()=>setStage(i)}>
              第 {i+1} 问
            </button>)}
          </div>
          <QuestionStage key={`${selected}-${active}-${knownX}-${knownY}-${ratio}-${majorSquared}-${minorSquared}-${pointAngle}-${area}`}
            step={steps[active]} index={active} total={steps.length}/>
          <div className={styles.stepNav}>
            <button type="button" disabled={active===0} onClick={()=>setStage(active-1)}>上一问</button>
            <button type="button" disabled={active===steps.length-1} onClick={()=>setStage(active+1)}>下一问 →</button>
          </div>
        </section>
      </div>
      <aside className={styles.right}>
        <section className={styles.editor}>
          <div className={styles.panelTitle}><strong>③ 命题人控制台</strong><button type="button" className={styles.reset} onClick={reset}>复原真题参数</button></div>
          <p className={styles.explain}>改变一道原题的条件，观察它如何影响后续所有小问，而不是每一问重新独立造题。</p>
          {selected==="jilin"?<>
            <Slider label="已知曲线上点 T 的横坐标" value={knownX} min={1} max={5} onChange={setKnownX}/>
            <Slider label="已知点 T 的纵坐标" value={knownY} min={-10} max={12} onChange={setKnownY}/>
            <Slider label="延长比 OQ / OP" value={ratio} min={.5} max={5} step={.5} onChange={setRatio}/>
            <Slider label="动点 P 横坐标 m" value={movingX} min={-5} max={6} step={.05} onChange={setMovingX}/>
            <div className={styles.facts}>
              <strong>当前命题关系</strong>
              <p>通过 T 反解 b = {fmt(jl.coefficient)}；所有后续问题自动沿用这一条抛物线。</p>
              <p>Q = −{fmt(ratio)}P</p>
              <p>y轴两侧面积比 = {jl.areaRatio}</p>
              <p>顶点约束会得到 {jl.criticalPoints.length} 个动点分支。</p>
            </div>
          </>:<>
            <Slider label="椭圆 a²" value={majorSquared} min={7} max={48}
              onChange={n=>{setMajorSquared(n);setMinorSquared(current=>Math.min(current,n-1));}}/>
            <Slider label="椭圆 b²（须小于 a²）" value={minorSquared} min={4} max={Math.min(32,majorSquared-1)} onChange={setMinorSquared}/>
            <Slider label="已知点 P 的参数角（°）" value={pointAngle} min={0} max={80} step={5} onChange={setPointAngle}/>
            <Slider label="要求 △ABP 面积" value={area} min={.5} max={25} step={.5} onChange={setArea}/>
            <div className={styles.facts}>
              <strong>当前命题关系</strong>
              <p>已知 A(0, {fmt(gc.A.y)})、P({fmt(gc.P.x)}, {fmt(gc.P.y)})，反求曲线。</p>
              <p>面积公式引出正负两个线性约束分支；需要分别检查它们是否与椭圆相交。</p>
              <p>当前候选 B 总数：{gc.candidates.length}；无实交点的分支不能出答案。</p>
            </div>
          </>}
        </section>
        <section className={styles.auditor}>
          <div className={styles.panelTitle}><strong>④ 可验证的命题边界</strong></div>
          {selected==="jilin"?<>
            <p>有效三角形：{jl.validTriangle?"是":"否"}。相似产生的面积比始终是关于延长比例的代数定值，不是对某一张截图的拟合。</p>
            <p>顶点条件：由二次方程得 {jl.criticalPoints.length} 个分支，均已纳入第三问。</p>
            <p>第四问：{jl.parts[3].answer}。目前只给出当前位置的严格符号分段判断，**没有把采样包装成整个 m 的精确解集**。</p>
          </>:<>
            {gc.candidateLines.map((line,i)=><p key={i}>面积等式第 {i+1} 分支（{line.branch>0?"+":"−"}）：
              {line.points.length===0?"无实交点":`${line.points.length} 个椭圆交点`}。
            </p>)}
            <p>初始真题参数下得到两条符合面积要求的直线；改变面积和椭圆后，分支可以消失或增加。</p>
          </>}
        </section>
      </aside>
    </div>
    <p className={styles.footer}>试题文字按公开真题的考点结构重新叙述；变式不冒充原题。中考第（4）问暂限当前参数判断，高考坐标在非原题参数时按显示精度近似。正式学生试题、答案和数据库均未改动。</p>
  </div>;
}
