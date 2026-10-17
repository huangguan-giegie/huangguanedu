"use client";
import {useMemo,useRef,useState,type PointerEvent} from "react";
import {runCAS,type CasAction,type CasResult} from "../lib/polynomial-cas";
import Link from "next/link";
import {AttachedGeometryFigure} from "./AttachedGeometryFigure";
import {geometryDraftImport,GEOMETRY_DRAFT_KEY} from "../lib/practice-drawing";
import {geometryMeasurements} from "../lib/geometry-cas-bridge";
import type {GeometryDocument} from "../lib/free-geometry";
import {
 DEFAULT_CAMERA,SURFACE_LABELS,build3DLines,cameraProject,plotToSvgPath,worldAxes,
 type Camera3D,type SurfaceKind,
} from "../lib/geometry-3d";
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
 {expr:"6x^2+4x",action:"integrate",label:"多项式积分"},
];
const surfaces:SurfaceKind[]=["plane","paraboloid","saddle","sphere","torus","helix"];
const safeError=(e:unknown)=>e instanceof Error?e.message:"计算出错";
function CasPanel(){
 const [expr,setExpr]=useState("x^2-5x+6");
 const [action,setAction]=useState<CasAction>("factor");
 const [x,setX]=useState("2");
 const [result,setResult]=useState<CasResult|null>(()=>runCAS("x^2-5x+6","factor"));
 const [error,setError]=useState("");
 const [drawing,setDrawing]=useState<GeometryDocument|null>(null);
 const measurements=drawing?geometryMeasurements(drawing):[];
 const importGeometry=()=>{
  try{
   const raw=window.localStorage.getItem(GEOMETRY_DRAFT_KEY);
   if(!raw)throw Error("请先在动态几何实验室或自由编辑器点击「用于模拟题」保存图形");
   setDrawing(geometryDraftImport(raw));
   setError("");
  }catch(e){setError(safeError(e));}
 };
 const applyMeasurement=(value:string)=>{
  setExpr(value);setAction("simplify");
  try{setResult(runCAS(value,"simplify"));setError("");}
  catch(e){setError(safeError(e));}
 };

 const solve=()=>{
  try{setResult(runCAS(expr,action,x));setError("");}
  catch(e){setError(safeError(e));setResult(null);}
 };
 return <div className={styles.section}>
  <div className={styles.sectionIntro}>
   <h2>符号代数 CAS</h2>
   <p>对一元多项式做精确分数运算，支持括号展开、因式分解、一二次方程、求导和代入求值。无需调用 AI 来猜计算结果。</p>
  </div>
  <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
    <button onClick={importGeometry} style={{border:"1px solid var(--line)",background:"var(--surface)",borderRadius:10,padding:"10px 15px",fontSize:13,fontWeight:800}}>读取几何实验室 / 编辑器的图形</button>
    <Link href="/geometry-lab" style={{fontSize:13,textDecoration:"underline"}}>动态几何实验室</Link>
    <Link href="/geometry-editor" style={{fontSize:13,textDecoration:"underline"}}>自由几何编辑器</Link>
    <Link href="/practice" style={{fontSize:13,textDecoration:"underline"}}>模拟题</Link>
  </div>
  {drawing&&<div style={{padding:14,border:"1px solid var(--line)",borderRadius:15,background:"var(--surface-soft)"}}>
    <strong>已载入当前图形：点击数值可将长度、面积或周长作为 CAS 输入</strong>
    <div style={{display:"flex",flexWrap:"wrap",gap:9,margin:"10px 0"}}>
      {measurements.map(m=><button key={m.id} type="button" onClick={()=>applyMeasurement(m.expression)}
        style={{border:"1px solid var(--line)",background:"var(--surface)",borderRadius:9,padding:"8px 10px",fontSize:12}}>
        {m.label}：{Number(m.value.toFixed(4))} {m.unit}
      </button>)}
    </div>
    <AttachedGeometryFigure document={drawing}/>
  </div>}
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
function ThreeDPanel(){
 const [kind,setKind]=useState<SurfaceKind>("paraboloid");
 const [amplitude,setAmplitude]=useState(1);
 const [camera,setCamera]=useState<Camera3D>(DEFAULT_CAMERA);
 const drag=useRef<{pointerId:number;x:number;y:number}|null>(null);
 const svg=useRef<SVGSVGElement|null>(null);
 const lines=useMemo(()=>build3DLines({kind,amplitude}),[kind,amplitude]);
 const cameraSafe=(change:Partial<Camera3D>)=>setCamera(v=>({...v,...change}));
 const start=(e:PointerEvent<SVGSVGElement>)=>{
  if(e.pointerType==="mouse"&&e.button!==0)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY};
 };
 const move=(e:PointerEvent<SVGSVGElement>)=>{
  const d=drag.current;if(!d||e.pointerId!==d.pointerId)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  drag.current={...d,x:e.clientX,y:e.clientY};
  setCamera(c=>({...c,azimuth:(c.azimuth+dx*.7+360)%360,elevation:Math.max(-80,Math.min(80,c.elevation-dy*.6))}));
 };
 const end=(e:PointerEvent<SVGSVGElement>)=>{
  if(drag.current?.pointerId!==e.pointerId)return;
  drag.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const exportSvg=()=>{
  if(!svg.current)return;
  const clone=svg.current.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  clone.setAttribute("width","700");clone.setAttribute("height","490");
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:"image/svg+xml"}));
  const link=document.createElement("a");link.href=url;link.download="math-surface-3d.svg";
  document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <div className={styles.section}>
  <div className={styles.sectionIntro}><h2>三维函数与曲面作图</h2>
   <p>用受约束的参数方程生成真实三维坐标，再映射到可拖动旋转的二维视图。支持球面、环面、抛物面、马鞍面、平面和螺旋线。</p>
  </div>
  <div className={styles.threeDLayout}>
   <section className={styles.viewport}>
    <div className={styles.viewportHead}><strong>{SURFACE_LABELS[kind]}</strong><button onClick={exportSvg}>导出 SVG</button></div>
    <svg ref={svg} viewBox="0 0 700 490" role="img" aria-label={SURFACE_LABELS[kind]+" 的三维线框图，可用鼠标或触屏旋转"}
     className={styles.threeDCanvas} onPointerDown={start} onPointerMove={move} onPointerUp={end}
     onPointerCancel={end} onLostPointerCapture={()=>{drag.current=null;}}>
     <rect width="700" height="490" fill="#f8fbff"/>
     <g stroke="#7896b1" strokeWidth="1.8">
      {worldAxes().map(axis=>{
       const a=cameraProject(axis.from,camera),b=cameraProject(axis.to,camera);
       return <g key={axis.name}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
        <text x={b.x+6} y={b.y-7} fontSize="15" fontWeight="bold" stroke="none" fill="#31516b">{axis.name}</text></g>;
      })}
     </g>
     <g fill="none" stroke="#277f9e" strokeWidth="1.55" strokeOpacity=".8">
      {lines.map((line,i)=><path key={i} d={plotToSvgPath(line,camera)}/>)}
     </g>
    </svg>
    <div className={styles.viewportFoot}>按住画布拖动以旋转视角 · 数学模型在浏览器本地计算</div>
   </section>
   <section className={styles.panel}>
    <label className={styles.field}>三维对象
     <select value={kind} onChange={e=>setKind(e.target.value as SurfaceKind)}>
      {surfaces.map(k=><option value={k} key={k}>{SURFACE_LABELS[k]}</option>)}
     </select>
    </label>
    <label className={styles.slider}>系数 a <strong>{amplitude.toFixed(1)}</strong><input type="range" min="-2" max="2" step=".1" value={amplitude} onChange={e=>setAmplitude(Number(e.target.value))}/></label>
    <label className={styles.slider}>水平旋转 <strong>{Math.round(camera.azimuth)}°</strong><input type="range" min="0" max="360" value={camera.azimuth} onChange={e=>cameraSafe({azimuth:Number(e.target.value)})}/></label>
    <label className={styles.slider}>俯仰角 <strong>{Math.round(camera.elevation)}°</strong><input type="range" min="-80" max="80" value={camera.elevation} onChange={e=>cameraSafe({elevation:Number(e.target.value)})}/></label>
    <label className={styles.slider}>缩放 <strong>{Math.round(camera.scale)}</strong><input type="range" min="14" max="85" value={camera.scale} onChange={e=>cameraSafe({scale:Number(e.target.value)})}/></label>
    <button className={styles.reset} onClick={()=>setCamera(DEFAULT_CAMERA)}>重置视角</button>
    <p className={styles.note}>这是数学精确参数模型驱动的三维线框绘图，不是 WebGL 实体渲染；暂不支持任意用户输入的三元表达式或 CAS 三维求解。</p>
   </section>
  </div>
 </div>;
}
export function MathStudio(){
 const [tab,setTab]=useState<"cas"|"3d">("cas");
 return <div className={styles.page}>
  <div className={styles.hero}><p>MATHEMATICS STUDIO · 高级数学工具</p>
   <h1>从代数推导到三维可视化</h1>
   <span>计算和绘制都使用可验证的数学定义，而不是生成式模型猜测。</span></div>
  <div className={styles.tabs} role="tablist" aria-label="数学工具切换">
   <button role="tab" aria-selected={tab==="cas"} onClick={()=>setTab("cas")}>∑ 符号代数 CAS</button>
   <button role="tab" aria-selected={tab==="3d"} onClick={()=>setTab("3d")}>◇ 三维曲面作图</button>
  </div>
  {tab==="cas"?<CasPanel/>:<ThreeDPanel/>}
  <p className={styles.bottom}>本页不修改学生模拟题的标准答案或数据库。它提供一元多项式 CAS 和常用三维参数曲面的教学工具，而非完整计算机代数系统。</p>
 </div>;
}
