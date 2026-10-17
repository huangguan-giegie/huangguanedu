"use client";
import {useState} from "react";
import {diameterCyclicQuadrilateral,geometryLabSnapshot} from "../lib/middle-school-geometry";
import {geometryDraftExport,GEOMETRY_DRAFT_KEY} from "../lib/practice-drawing";

type Topic="circle"|"triangle"|"polygon"|"parallel"|"sector";
const topics:{key:Topic;name:string}[]=[
 {key:"circle",name:"圆内接四边形"},
 {key:"triangle",name:"勾股定理"},
 {key:"polygon",name:"正多边形内角"},
 {key:"parallel",name:"平行线与截线"},
 {key:"sector",name:"弧长与扇形"},
];
const fmt=(v:number)=>Number(v.toFixed(2));
export function JuniorTheoremPlayground(){
 const [topic,setTopic]=useState<Topic>("circle");
 const [adc,setAdc]=useState(125);
 const [a,setA]=useState(3),[b,setB]=useState(4);
 const [n,setN]=useState(5),[alpha,setAlpha]=useState(65);
 const [r,setR]=useState(6),[theta,setTheta]=useState(60);
 const [status,setStatus]=useState("");
 const g=diameterCyclicQuadrilateral(adc);
 const P=(pt:{x:number;y:number})=>({x:210+pt.x*20,y:170-pt.y*20});
 const poly=Array.from({length:n},(_,i)=>{
  const angle=2*Math.PI*i/n-Math.PI/2;
  return {x:210+110*Math.cos(angle),y:170+110*Math.sin(angle)};
 });
 const standard={maxWidth:"100%",width:"100%",height:"auto",background:"#f6fbfd",borderRadius:15} as const;
 const storeCircle=()=>{
  const doc=geometryLabSnapshot("diameter");
  window.localStorage.setItem(GEOMETRY_DRAFT_KEY,geometryDraftExport(doc));
  window.localStorage.setItem("hg-geometry-editor-v1",JSON.stringify(doc));
  setStatus("已生成可修改的直径圆周角模板。注意：当前模板定格为125°，其他角度请先在自由编辑器中核对并修改。");
 };
 const result=topic==="circle"?`∠BAC = ${fmt(adc-90)}°；∠ACB = 90°；∠ADC = ${adc}°`:
  topic==="triangle"?`斜边 c = √(${a}² + ${b}²) = ${fmt(Math.hypot(a,b))}`:
  topic==="polygon"?`内角和 = ${(n-2)*180}°；每个内角 = ${fmt((n-2)*180/n)}°；外角 = ${fmt(360/n)}°`:
  topic==="parallel"?`同位角 = 内错角 = ${alpha}°；同旁内角 = ${180-alpha}°`:
  `弧长 = ${fmt(theta/180*Math.PI*r)}；扇形面积 = ${fmt(theta/360*Math.PI*r*r)}`;
 return <section style={{padding:20,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:17}}>
  <h2 style={{fontSize:20,fontWeight:800}}>初中几何 · 五种实时定理实验</h2>
  <p style={{fontSize:13,marginTop:8,color:"var(--muted)",lineHeight:1.8}}>改变长度、角度和边数，下面的几何图和公式答案由相同参数计算。</p>
  <div role="group" aria-label="定理实验种类" style={{display:"flex",flexWrap:"wrap",gap:8,margin:"15px 0"}}>
   {topics.map(t=><button type="button" key={t.key} aria-pressed={topic===t.key} onClick={()=>setTopic(t.key)}
    style={{padding:"9px 12px",background:topic===t.key?"#146d82":"var(--surface-soft)",color:topic===t.key?"white":"inherit",borderRadius:10,fontSize:13,fontWeight:700}}>{t.name}</button>)}
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))",gap:15,alignItems:"center"}}>
   <svg viewBox="0 0 420 340" role="img" aria-label={result} style={standard}>
    {topic==="circle"&&<>
     <circle cx="210" cy="170" r="100" fill="#e1f0f9" stroke="#2b617d" strokeWidth="3"/>
     {(["A","B","C","D"] as const).map(k=>{
      const from=P(g[k]);const scale=1;void scale;
      return <g key={k}><circle cx={from.x} cy={from.y} r="3" fill="#254862"/>
       <text x={from.x+7} y={from.y-10} fontSize="16" fill="#233950">{k}</text></g>;
     })}
     {([["A","B"],["A","D"],["D","C"],["C","B"],["A","C"]] as const).map(([first,last])=>{
      const x=P(g[first]),y=P(g[last]);
      return <line key={first+last} x1={x.x} y1={x.y} x2={y.x} y2={y.y} stroke="#287d98" strokeWidth="2.6"/>;
     })}
     <text x="218" y="188" fontSize="14">O</text>
    </>}
    {topic==="triangle"&&(()=>{
     const unit=Math.min(190/a,190/b);
     const A={x:100,y:275},B={x:100+a*unit,y:275},C={x:100,y:275-b*unit};
     return <g><polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`} fill="#cce9f2" stroke="#267b98" strokeWidth="3"/>
      <path d="M 100 258 H 117 V 275" fill="none" stroke="#df8755" strokeWidth="2"/>
      <text x={(A.x+B.x)/2} y="298" textAnchor="middle" fontSize="16">{a}</text>
      <text x="72" y={(A.y+C.y)/2} fontSize="16">{b}</text>
      <text x={(B.x+C.x)/2+13} y={(B.y+C.y)/2} fontSize="16">c</text></g>;
    })()}
    {topic==="polygon"&&<g>
     <polygon points={poly.map(p=>p.x+","+p.y).join(" ")} fill="#d1ecf2" stroke="#247b95" strokeWidth="3"/>
     {poly.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#26445c"/>)}
     <text x="210" y="170" textAnchor="middle" fontSize="16">n = {n}</text>
    </g>}
    {topic==="parallel"&&<>
      <path d="M 35 100 H 385 M 35 240 H 385" stroke="#245973" strokeWidth="3"/>
      <path d="M 120 310 L 285 35" stroke="#de8558" strokeWidth="3"/>
      <text x="250" y="84" fontSize="17">{alpha}°</text>
      <text x="194" y="218" fontSize="17">{180-alpha}°</text>
      <text x="38" y="90" fontSize="14">l₁</text><text x="38" y="232" fontSize="14">l₂</text>
    </>}
    {topic==="sector"&&(()=>{
     const start=-90, end=start+theta;
     const A={x:210+110*Math.cos(start*Math.PI/180),y:170+110*Math.sin(start*Math.PI/180)};
     const B={x:210+110*Math.cos(end*Math.PI/180),y:170+110*Math.sin(end*Math.PI/180)};
     return <g><circle cx="210" cy="170" r="110" fill="none" stroke="#a2cbd8" strokeWidth="2"/>
      <path d={`M 210 170 L ${A.x} ${A.y} A 110 110 0 ${theta>180?1:0} 1 ${B.x} ${B.y} Z`}
       fill="#d5eff1" stroke="#147c94" strokeWidth="3"/>
      <text x="227" y="151" fontSize="16">{theta}°</text><text x="225" y="108" fontSize="16">r={r}</text></g>;
    })()}
   </svg>
   <div style={{display:"grid",gap:13}}>
     {(topic==="circle"?[{label:"∠ADC",value:adc,min:100,max:155,onChange:setAdc,unit:"°"}]:
       topic==="triangle"?[{label:"直角边 a",value:a,min:2,max:10,onChange:setA,unit:"cm"},{label:"直角边 b",value:b,min:2,max:10,onChange:setB,unit:"cm"}]:
       topic==="polygon"?[{label:"边数 n",value:n,min:3,max:12,onChange:setN,unit:"条"}]:
       topic==="parallel"?[{label:"同位角",value:alpha,min:20,max:150,onChange:setAlpha,unit:"°"}]:
       [{label:"半径 r",value:r,min:2,max:12,onChange:setR,unit:"cm"},{label:"圆心角",value:theta,min:20,max:300,onChange:setTheta,unit:"°"}])
       .map(sl=><label key={sl.label} style={{display:"grid",gap:6,fontSize:13,fontWeight:750}}>
        {sl.label} = {sl.value}{sl.unit}
        <input type="range" min={sl.min} max={sl.max} value={sl.value} onChange={e=>sl.onChange(Number(e.target.value))} style={{accentColor:"#167f93"}}/>
       </label>)}
    <div aria-live="polite" style={{background:"var(--surface-soft)",padding:14,borderRadius:12,fontSize:14,fontWeight:800,lineHeight:1.7}}>{result}</div>
    {topic==="circle"&&<button onClick={storeCircle} style={{background:"#147889",color:"white",borderRadius:10,padding:10}}>将圆周角示例放入自由几何编辑器</button>}
    {status&&<p role="status" style={{fontSize:12}}>{status}</p>}
   </div>
  </div>
 </section>;
}
