"use client";
import {useState} from "react";
import {runCAS,type CasAction,type CasResult} from "../lib/polynomial-cas";
import {FunctionExamExplorer} from "./FunctionExamExplorer";
import {ConicExamExplorer} from "./ConicExamExplorer";
import styles from "./MathStudio.module.css";
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
    }}>将当前表达式显示在下方函数图像中 ↓</button>
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
export function MathStudio(){
 const [tab,setTab]=useState<"cas"|"conic">("cas");
 const [graphExpression,setGraphExpression]=useState("x^2-4x+3");
 return <div className={styles.page}>
  <div className={styles.hero}><p>MATHEMATICS STUDIO · 高级数学工具</p>
   <h1>中考函数图像与高考圆锥曲线</h1>
   <span>计算和绘制都使用可验证的数学定义，而不是生成式模型猜测。</span></div>
  <div className={styles.tabs} role="tablist" aria-label="数学工具切换">
   <button role="tab" aria-selected={tab==="cas"} onClick={()=>setTab("cas")}>∑ 符号代数 CAS</button>
   <button role="tab" aria-selected={tab==="conic"} onClick={()=>setTab("conic")}>◇ 高考圆锥曲线与直线</button>
  </div>
  {tab==="cas"?<><CasPanel onGraph={setGraphExpression}/><FunctionExamExplorer key={graphExpression} initialExpression={graphExpression}/></>:<ConicExamExplorer/>}
  <p className={styles.bottom}>本页不修改学生模拟题的标准答案或数据库。它提供一元多项式 CAS、函数曲线和圆锥曲线的确定性数学教学工具，而非完整计算机代数系统。</p>
 </div>;
}
