"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {runCAS,type CasAction,type CasResult} from "../lib/polynomial-cas";
import {FunctionExamExplorer} from "./FunctionExamExplorer";
import {ConicExamExplorer} from "./ConicExamExplorer";
import {MathLabNav,type MathStudioView} from "./MathLabNav";
import styles from "./MathStudio.module.css";
import { AcademyArt } from "./AcademyArt";
const commands:{action:CasAction;label:string}[]=[
 {action:"simplify",label:"展开 / 化简"},
 {action:"factor",label:"因式分解"},
 {action:"solve",label:"解方程"},
 {action:"differentiate",label:"求导"},
 {action:"evaluate",label:"代入求值"},
];
const presets:{expr:string;action:CasAction;label:string}[]=[
 {expr:"(x+2)(x-3) + 2x",action:"simplify",label:"展开乘积"},
 {expr:"x^2-5x+6",action:"factor",label:"分解二次式"},
 {expr:"2x^2-8=0",action:"solve",label:"解二次方程"},
 {expr:"3x^3-2x+1",action:"differentiate",label:"多项式求导"},
];
const safeError=(e:unknown)=>e instanceof Error?e.message:"计算出错";
function CasPanel({onGraph}:{onGraph:(expression:string)=>void}){
 const [expr,setExpr]=useState("x^2-5x+6");
 const [action,setAction]=useState<CasAction>("factor");
 const [x,setX]=useState("2");
 const [result,setResult]=useState<CasResult|null>(()=>runCAS("x^2-5x+6","factor"));
 const [error,setError]=useState("");
 const solve=()=>{
  try{setResult(runCAS(expr,action,x));setError("");}
  catch(e){setError(safeError(e));setResult(null);}
 };
 return <div className={styles.section}>
  <div className={styles.sectionIntro}>
   <h2>符号代数 CAS</h2>
   <p>对一元多项式做精确分数运算，支持括号展开、因式分解、一二次方程、求导和代入求值。无需调用 AI 来猜计算结果。</p>
  </div>
  <button type="button" style={{textDecoration:"underline",textAlign:"left",color:"var(--foreground)",fontSize:13}} onClick={()=>{
   try{
    const imported=window.localStorage.getItem("hg-cas-input-v1");
    if(!imported)throw Error("没有待计算的几何数据，请先在自由几何编辑器选中直线或线段。");
    const computed=runCAS(imported,"simplify");
    setExpr(imported);setAction("simplify");setResult(computed);setError("");
   }catch(e){setError(safeError(e));setResult(null);}
  }}>↙ 从自由几何编辑器读取两点距离²表达式</button>
  <div className={styles.quickSamples}>{presets.map(p=><button key={p.label}
   type="button" onClick={()=>{setExpr(p.expr);setAction(p.action);setResult(runCAS(p.expr,p.action));setError("");}}>{p.label}</button>)}</div>
  <div className={styles.casLayout}>
   <section className={styles.panel}>
    <label className={styles.field}>表达式 / 方程
     <input value={expr} maxLength={150} onChange={e=>setExpr(e.target.value)}
      placeholder="例如：(x+2)(x-3) 或 x²-5x+6=0" onKeyDown={e=>{if(e.key==="Enter")solve();}}/>
    </label>
    <fieldset className={styles.actionGroup}>
     <legend>计算类型</legend>
     <div className={styles.actionGrid}>{commands.map(c=><button type="button" key={c.action}
      onClick={()=>setAction(c.action)} aria-pressed={action===c.action}
      className={action===c.action?styles.actionSelected:styles.action}>{c.label}</button>)}</div>
    </fieldset>
    {action==="evaluate"&&<label className={styles.field}>代入 x 的值<input value={x}
     onChange={e=>setX(e.target.value)} placeholder="如 1/2"/></label>}
    <button className={styles.primary} onClick={solve}>计算并显示步骤 →</button>
    <button className={styles.reset} onClick={()=>{
     const candidate=expr.split("=")[0].trim();
     if(candidate)onGraph(candidate);
    }}>将当前表达式送到函数图像 →</button>
    <p className={styles.note}>支持隐式乘法（如 2x、(x+1)(x-2)）、整数幂、分数和最多 6 位小数。暂不支持三角函数、对数和一般有理函数；求根限制在二次以内。</p>
   </section>
   <section className={styles.result} aria-live="polite">
    <div className={styles.resultTitle}>COMPUTED RESULT · 运算结果</div>
    {error?<div role="alert" className={styles.error}>{error}</div>:result?<>
     <div className={styles.resultExpr}>{result.result}</div>
     <h3>推导过程</h3>
     <ol>{result.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
    </>:<p className={styles.placeholder}>输入表达式后选择计算类型。</p>}
   </section>
  </div>
 </div>;
}
export function MathStudio({view="functions",initialExpression,conicPreset}:{view?:MathStudioView;initialExpression?:string;conicPreset?:"hubei2022"|"hubei2025"}){
 const router=useRouter();
 return <div className={styles.page}>
  <MathLabNav current={view}/>
  <div className={`${styles.hero} academy-math-hero`}><AcademyArt kind="function" className="academy-math-art" /><p>MATHEMATICS STUDIO · 函数与代数</p>
   <h1>{view==="functions"?"研究表达式，观察函数变化。":view==="conics"?"研究曲线与直线的交点。":"精确计算，逐步理解代数。"}</h1>
   <span>真题探究中的表达式可以直接在这里继续研究；自由改动后的结果按当前参数计算。</span></div>
  {view==="functions"?<FunctionExamExplorer initialExpression={initialExpression}/>:view==="conics"?<ConicExamExplorer initialPreset={conicPreset}/>:<CasPanel onGraph={expression=>router.push(`/math-studio?view=functions&expression=${encodeURIComponent(expression)}`)}/>}
  <p className={styles.bottom}>函数、圆锥曲线与符号计算使用统一工具。综合题的题设约束与连续推导请在「真题探究」中查看。</p>
 </div>;
}
