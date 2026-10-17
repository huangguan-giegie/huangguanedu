"use client";
import {useState} from "react";
import Link from "next/link";
import {filterTheorems,JUNIOR_THEOREMS} from "../lib/junior-geometry-theorems";

export function GeometryTheoremLibrary({compact=false}:{compact?:boolean}){
 const [search,setSearch]=useState("");
 const [category,setCategory]=useState("全部");
 const [expanded,setExpanded]=useState<string|null>("cyclic");
 const selected=filterTheorems(search,category);
 return <section aria-label="初中几何定理库" style={{border:"1px solid var(--line)",background:"var(--surface)",borderRadius:17,padding:20,marginTop:20}}>
  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
   <h2 style={{fontWeight:800,fontSize:19}}>初中几何定理库 · {JUNIOR_THEOREMS.length} 条</h2>
   <span style={{fontSize:12,color:"var(--muted)"}}>逐条查看适用条件和算例</span>
  </div>
  <div style={{display:"flex",gap:9,flexWrap:"wrap",margin:"16px 0"}}>
   <label style={{flex:"1 1 210px"}}><span className="sr-only">检索定理</span>
    <input aria-label="检索定理" value={search} onChange={e=>setSearch(e.target.value)} placeholder="例如：垂径、相似、角平分线"
     style={{width:"100%",border:"1px solid var(--line)",borderRadius:9,background:"var(--surface-soft)",color:"var(--foreground)",padding:"11px 13px"}}/>
   </label>
   <select aria-label="定理类别" value={category} onChange={e=>setCategory(e.target.value)}
    style={{border:"1px solid var(--line)",borderRadius:9,background:"var(--surface-soft)",color:"var(--foreground)",padding:"8px 12px"}}>
    {["全部","三角形","圆","四边形","相似与比例","坐标"].map(k=><option key={k}>{k}</option>)}
   </select>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:10}}>
   {(compact?selected.slice(0,9):selected).map(t=><article key={t.id} style={{border:"1px solid var(--line)",borderRadius:12,padding:13,background:"var(--surface-soft)"}}>
    <button type="button" onClick={()=>setExpanded(v=>v===t.id?null:t.id)}
     aria-expanded={expanded===t.id} style={{width:"100%",textAlign:"left",display:"grid",gap:7}}>
     <strong style={{fontSize:14}}>{t.name}</strong>
     <span style={{fontSize:14,fontWeight:700,color:"var(--foreground)"}}>{t.formula}</span>
     <span style={{fontSize:12,color:"var(--muted)"}}>{expanded===t.id?"收起使用条件 ↑":"查看条件与例题 ↓"}</span>
    </button>
    {expanded===t.id&&<div style={{borderTop:"1px solid var(--line)",marginTop:10,paddingTop:11,lineHeight:1.9,fontSize:13}}>
     <p><strong>适用条件：</strong>{t.use}</p><p><strong>算例：</strong>{t.example}</p>
    </div>}
   </article>)}
  </div>
  {selected.length===0&&<p role="status">没有找到匹配的定理。</p>}
  <p style={{marginTop:16,fontSize:13,lineHeight:1.8,color:"var(--muted)"}}>
   应用到作图：<Link href="/geometry-lab" style={{textDecoration:"underline"}}>动态实验室</Link> · <Link href="/geometry-editor" style={{textDecoration:"underline"}}>自由编辑器</Link> · <Link href="/math-studio" style={{textDecoration:"underline"}}>代数 CAS</Link>
  </p>
 </section>;
}
