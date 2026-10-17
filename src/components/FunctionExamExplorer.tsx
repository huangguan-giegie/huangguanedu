"use client";
import {useMemo,useState} from "react";
import {compileExpression} from "../lib/diagram-renderer/expression-parser";
import {parsePolynomial} from "../lib/polynomial-cas";
import styles from "./ExamExplorer.module.css";

export type ExamFunction={name:string;expression:string;topic:string;rule:string};
export const EXAM_FUNCTIONS:ExamFunction[]=[
 {name:"一次函数",expression:"2x-1",topic:"中考·一次函数",rule:"斜率 k 决定增减性；与 y 轴交点为 (0,b)。"},
 {name:"二次函数",expression:"x^2-4x+3",topic:"中考·二次函数",rule:"对称轴 x=−b/(2a)，顶点坐标与零点决定抛物线特征。"},
 {name:"反比例函数",expression:"6/x",topic:"中考·反比例函数",rule:"y=k/x；x≠0，两支曲线以坐标轴为渐近线。"},
 {name:"根式函数",expression:"sqrt(x+2)",topic:"中考·函数定义域",rule:"被开方数非负：x≥−2，函数值 y≥0。"},
 {name:"正弦函数",expression:"2sin(x)",topic:"高考·三角函数",rule:"sin 的自变量单位为弧度，振幅 2，周期 2π。"},
 {name:"余弦函数",expression:"cos(2x)",topic:"高考·三角函数",rule:"cos(ωx) 的周期为 2π/|ω|；本例周期 π。"},
 {name:"正切函数",expression:"tan(x)",topic:"高考·三角函数",rule:"tan(x) 周期 π，在 x=π/2+kπ 处无定义。"},
 {name:"指数函数",expression:"2^x",topic:"高考·指数函数",rule:"底数大于 1 时单调递增，过 (0,1)，值域为 (0,+∞)。"},
 {name:"对数函数",expression:"ln(x)",topic:"高考·对数函数",rule:"ln(x) 的定义域 x>0，过 (1,0)，与 e^x 互为反函数。"},
 {name:"绝对值函数",expression:"abs(x-2)",topic:"中考·分段与绝对值",rule:"|x−2| 在 x=2 取得最小值 0，可分段去绝对值。"},
];
const W=720,H=440,scale=33;
const X=(x:number)=>W/2+x*scale,Y=(y:number)=>H/2-y*scale;
export function sampleFunction(expression:string):{paths:string[];zeroes:number[];yIntercept:number|null;vertex:{x:number;y:number}|null}{
 const evalAt=compileExpression(expression,{maxLength:160}).evaluate;
 let pieces:string[][]=[],piece:string[]=[],lastY:number|null=null;
 const flush=()=>{if(piece.length>1)pieces.push(piece);piece=[];lastY=null;};
 const steps=750;
 const zeroes:number[]=[];
 for(let i=0;i<=steps;i++){
  const x=-9+i*18/steps,y=evalAt(x);
  if(!Number.isFinite(y)||Math.abs(y)>50||lastY!==null&&Math.abs(y-lastY)>5){flush();if(!Number.isFinite(y)||Math.abs(y)>50)continue;}
  if(y>=-7&&y<=7){
   piece.push((piece.length?"L":"M")+X(x).toFixed(2)+" "+Y(y).toFixed(2));
  }else flush();
  if(i>0&&Math.abs(y)<.03&&zeroes.every(v=>Math.abs(v-x)>.2)&&zeroes.length<12)zeroes.push(x);
  lastY=y;
 }
 flush();
 let vertex:null|{x:number;y:number}=null;
 try{
  const p=parsePolynomial(expression);
  if(p.length===3&&p[2].n!==0){
   const a=p[2].n/p[2].d,b=p[1].n/p[1].d;
   const vx=-b/(2*a);vertex={x:vx,y:evalAt(vx)};
  }
 }catch{/** Transcendentals are graphable, not polynomials. */}
 const yIntercept=evalAt(0);
 return {paths:pieces.map(p=>p.join(" ")),zeroes,yIntercept:Number.isFinite(yIntercept)?yIntercept:null,vertex};
}
export function FunctionExamExplorer({compact=false}:{compact?:boolean}){
 const [preset,setPreset]=useState("二次函数");
 const [expression,setExpression]=useState("x^2-4x+3");
 const [saved,setSaved]=useState("x^2-4x+3");
 const [error,setError]=useState("");
 const graph=useMemo(()=>{
  try{return sampleFunction(saved);}
  catch{return null;}
 },[saved]);
 const selected=EXAM_FUNCTIONS.find(x=>x.name===preset);
 const submit=()=>{
  try{compileExpression(expression,{maxLength:160});setSaved(expression);setError("");}
  catch(e){setError(e instanceof Error?e.message:"函数表达式不合法");}
 };
 return <div className={styles.explorer}>
  <header className={styles.heading}><div><strong>函数图像 · 中高考考点</strong><p>精确表达式解析 · 函数定义域 · 截距 / 顶点 · 单调性和周期</p></div></header>
  <div className={styles.presets}>{EXAM_FUNCTIONS.map(m=><button type="button" key={m.name} aria-pressed={preset===m.name} onClick={()=>{
   setPreset(m.name);setExpression(m.expression);setSaved(m.expression);setError("");
  }}>{m.name}</button>)}</div>
  <div className={styles.layout}>
   <div className={styles.plot}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`函数 y=${saved} 的二维坐标图`}>
     <rect width={W} height={H} fill="#f9fcff"/>
     {Array.from({length:23},(_,i)=>i-11).map(i=><g key={i} stroke={i===0?"#788da9":"#e1edf5"} strokeWidth={i===0?1.8:1}>
      <line x1={X(i)} x2={X(i)} y1="0" y2={H}/>
      <line x1="0" x2={W} y1={Y(i)} y2={Y(i)}/>
     </g>)}
     {graph?.paths.map((path,i)=><path key={i} d={path} fill="none" stroke="#16879a" strokeWidth="3.3" strokeLinecap="round"/>)}
     {graph?.vertex&&Math.abs(graph.vertex.x)<9&&Math.abs(graph.vertex.y)<7&&<g>
      <circle cx={X(graph.vertex.x)} cy={Y(graph.vertex.y)} r="5" fill="#ee9257" stroke="white" strokeWidth="2"/>
      <text x={X(graph.vertex.x)+9} y={Y(graph.vertex.y)-11} fontSize="14" fill="#3d485f">顶点</text>
     </g>}
     <text x="698" y={Y(0)-8} fontSize="15" fill="#344b65">x</text>
     <text x={X(0)+10} y="17" fontSize="15" fill="#344b65">y</text>
    </svg>
    <small>横轴与纵轴等比例；三角函数默认弧度；遇到间断点不连接跨越渐近线的线段。</small>
   </div>
   <div className={styles.controls}>
    <label>输入 y = f(x)
     <input aria-label="函数表达式" value={expression} maxLength={160} onChange={e=>setExpression(e.target.value)}
      onKeyDown={e=>{if(e.key==="Enter")submit();}}/>
    </label>
    <button type="button" className={styles.primary} onClick={submit}>绘制函数图像</button>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <section className={styles.facts} aria-live="polite">
     <h3>{selected?.topic??"自定义函数"}</h3>
     <p>{selected&&expression===selected.expression?selected.rule:"自定义表达式的图形仅作数值分析；请根据定义域判断截距与极值。"}</p>
     {graph?.vertex&&<p>二次函数顶点：({graph.vertex.x.toFixed(3)}, {graph.vertex.y.toFixed(3)})</p>}
     {graph?.yIntercept!==null&&graph?.yIntercept!==undefined&&<p>与 y 轴交点：(0, {graph.yIntercept.toFixed(3)})</p>}
     <p>画布展示 x∈[−9,9]。图像是确定性采样结果，不把数值采样当作解析证明。</p>
    </section>
    {!compact&&<p className={styles.tip}>常用中考练习：求一次函数解析式、二次函数顶点与零点、反比例函数象限、函数图像交点与定义域。高考练习：三角函数图像变换、指数对数单调性和反函数。</p>}
   </div>
  </div>
 </div>;
}
