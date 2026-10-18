"use client";

import { useCallback,useEffect,useId,useRef,useState,type PointerEvent,type ChangeEvent } from "react";
import {
 blankDocument,createPoint,createShape,createIntersections,createPolygon,createLocus,polygonMeasures,resolveDocument,
 movePoint,resizeMeasuredObject,rotateMeasuredObject,deleteCascade,renameObject,hideObject,validateDocument,parseDocumentJSON,
 starterDocument,type GeometryDocument,type GeometryObject,type Resolved,type Point,
} from "../lib/free-geometry";
import {sampleLocus,locusPaths} from "../lib/geometry-locus";
import {GeometryTheoremLibrary} from "./GeometryTheoremLibrary";
import {useRouter} from "next/navigation";
import styles from "./FreeGeometryEditor.module.css";

type Tool="move"|"point"|"line"|"segment"|"circle"|"intersection"|"polygon"|"locus";
type View={scale:number;ox:number;oy:number};
type ActiveDrag={kind:"point";id:string;pointerId:number}|{kind:"pan";last:Point;pointerId:number};
const W=960,H=590;
const TOOLS: {id:Tool;name:string;hint:string}[]=[
 {id:"move",name:"移动 / 选择",hint:"拖动自由点、移动画布或选择对象"},
 {id:"point",name:"点",hint:"在空白处点击创建自由点"},
 {id:"line",name:"直线",hint:"依次选择两个点（也可点击空白处新建点）"},
 {id:"segment",name:"线段",hint:"依次选择两个点，创建有限线段"},
 {id:"circle",name:"圆",hint:"先选择圆心，再选择圆周点"},
 {id:"intersection",name:"交点",hint:"依次选择两条线或圆，自动创建所有有限交点"},
 {id:"polygon",name:"多边形",hint:"顺序选择三个以上的点，然后点击「完成多边形」"},
 {id:"locus",name:"轨迹",hint:"先选自由驱动点，再选路径线/圆，最后选依赖驱动点的目标点"},
];
const isShape=(o:GeometryObject)=>o.kind==="line"||o.kind==="segment"||o.kind==="circle";
function saveAs(name:string,mime:string,content:string) {
 const blob=new Blob([content],{type:mime});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function docName(o:GeometryObject):string{
 return o.kind==="point"?"自由点":o.kind==="intersection"?"交点":
 o.kind==="line"?"直线":o.kind==="segment"?"线段":o.kind==="circle"?"圆":o.kind==="polygon"?"多边形":"轨迹";
}
const safeError=(error:unknown)=>error instanceof Error?error.message:"操作失败";

function MeasureControl({object,resolved,onApply}:{
 object:GeometryObject;resolved:Resolved[];onApply:(next:number)=>void;
}){
 const found=resolved.find(r=>r.object.id===object.id);
 const isCircle=object.kind==="circle";
 const start=isCircle?found?.circle?.center:found?.line?.a;
 const end=object.kind==="circle"?resolved.find(r=>r.object.id===object.through)?.point:found?.line?.b;
 const length=start&&end?Math.hypot(end.x-start.x,end.y-start.y):null;
 const measuredValue=length===null?"":String(Number(length.toFixed(3)));
 const [draft,setDraft]=useState(measuredValue);
 const [editing,setEditing]=useState(false);
 const value=editing?draft:measuredValue;
 if(length===null)return <p className={styles.meta}>当前测量依赖交点尚不存在，请先调整上游图形。</p>;
 const label=isCircle?"圆的半径 r":"定位端点之间的长度 L";
 return <form style={{display:"grid",gap:9,padding:"12px 0"}}
  onBlurCapture={e=>{
   const next=e.relatedTarget;
   if(!(next instanceof Node&&e.currentTarget.contains(next)))setEditing(false);
  }}
  onSubmit={e=>{
  e.preventDefault();
  const target=Number(draft);
  if(!draft.trim()||!Number.isFinite(target))return;
  onApply(target);
  setEditing(false);
 }}>
  <label>{label}
   <input type="number" aria-label={label} step="any" min=".001" max="500" value={value}
    onFocus={()=>{setDraft(measuredValue);setEditing(true);}}
    onChange={e=>setDraft(e.target.value)}/></label>
  <button type="submit" className={styles.delete} style={{borderColor:"#84bdc6",color:"var(--foreground)"}}>应用长度 / 半径并重绘</button>
  <p className={styles.meta}>
   {isCircle
    ?`半径：r=√[(${end!.x.toFixed(2)}−${start!.x.toFixed(2)})²+(${end!.y.toFixed(2)}−${start!.y.toFixed(2)})²]=${length.toFixed(3)}。`
    :`两点距离：L=√[(x₂−x₁)²+(y₂−y₁)²]=${length.toFixed(3)}。两点距离不是无限直线的总长度。`}
   修改时沿当前方向移动第二个自由定位点，所有依赖构造会自动重算；若第二点是关联交点，请先编辑其上游自由点。
  </p>
 </form>;
}
function AngleControl({object,resolved,onApply}:{object:GeometryObject;resolved:Resolved[];onApply:(degree:number)=>void}){
 const line=resolved.find(v=>v.object.id===object.id)?.line;
 if(!line)return null;
 const angle=Math.atan2(line.b.y-line.a.y,line.b.x-line.a.x)*180/Math.PI;
 return <label>方向角 θ（相对 x 轴，单位°）
  <input type="number" min="-360" max="360" step="1" value={Number(angle.toFixed(2))}
   onChange={e=>{if(e.target.value!=="")onApply(Number(e.target.value));}}/>
  <span className={styles.meta}>长度固定、旋转末端自由点；适用于斜率、平行、垂直及三角形角度条件。</span>
 </label>;
}
export function FreeGeometryEditor() {
 const router=useRouter();
 const [doc,setDoc]=useState<GeometryDocument>(()=>starterDocument());
 const docRef=useRef(doc);
 const [hydrated,setHydrated]=useState(false);
 const [tool,setTool]=useState<Tool>("move");
 const [pending,setPending]=useState<string|null>(null);
 const [polygonVertices,setPolygonVertices]=useState<string[]>([]);
 const [locusDraft,setLocusDraft]=useState<{driver:string;path?:string}|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [notice,setNotice]=useState("选择工具，开始探索。");
 const [view,setView]=useState<View>({scale:44,ox:W/2,oy:H/2});
 const [showGrid,setShowGrid]=useState(true);
 const [undo,setUndo]=useState<GeometryDocument[]>([]);
 const [redo,setRedo]=useState<GeometryDocument[]>([]);
 const drag=useRef<ActiveDrag|null>(null);
 const svg=useRef<SVGSVGElement|null>(null);
 const importRef=useRef<HTMLInputElement|null>(null);
 const gridId=useId(),clipId=useId();
 const resolved=resolveDocument(doc);
 const selectedObject=doc.objects.find(o=>o.id===selected);
 const toScreen=useCallback((p:Point):Point=>({x:view.ox+p.x*view.scale,y:view.oy-p.y*view.scale}),[view]);
 const toWorld=useCallback((p:Point):Point=>({x:(p.x-view.ox)/view.scale,y:(view.oy-p.y)/view.scale}),[view]);
 const svgCoordinates=(event:PointerEvent<SVGSVGElement>):Point|null=>{
  const root=svg.current,ctm=root?.getScreenCTM();
  if(!ctm)return null;
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(ctm.inverse());
  return {x:p.x,y:p.y};
 };
 const note=(msg:string)=>setNotice(msg);
 const commit=(next:GeometryDocument,remember=true)=>{
  validateDocument(next);
  const previous=docRef.current;
  if(JSON.stringify(previous)===JSON.stringify(next))return;
  if(remember)setUndo(items=>[...items.slice(-49),previous]);
  docRef.current=next;setDoc(next);
  if(remember)setRedo([]);
 };
 const undoAction=()=>{
  if(!undo.length)return;
  const previous=undo[undo.length-1];
  setRedo(items=>[...items.slice(-49),docRef.current]);
  setUndo(items=>items.slice(0,-1));
  docRef.current=previous;setDoc(previous);setPending(null);setSelected(null);setPolygonVertices([]);setLocusDraft(null);
  note("已撤销");
 };
 const redoAction=()=>{
  if(!redo.length)return;
  const next=redo[redo.length-1];
  setUndo(items=>[...items.slice(-49),docRef.current]);
  setRedo(items=>items.slice(0,-1));
  docRef.current=next;setDoc(next);setPending(null);setSelected(null);setPolygonVertices([]);setLocusDraft(null);
  note("已重做");
 };
 // Read once. No server-side data or account data is stored.
 useEffect(()=>{
  // Restore after first paint to keep server/client markup identical.
  const frame=window.requestAnimationFrame(()=>{
   try{
    const value=window.localStorage.getItem("hg-geometry-editor-v1");
    if(value){
     const loaded=parseDocumentJSON(value);
     docRef.current=loaded;setDoc(loaded);
    }
   }catch{setNotice("本地画布无法恢复，已加载默认示例。");}
   setHydrated(true);
  });
  return ()=>window.cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{
  if(!hydrated)return;
  try{window.localStorage.setItem("hg-geometry-editor-v1",JSON.stringify(doc));}
  catch{window.queueMicrotask(()=>setNotice("本地空间不足：建议导出 JSON 备份。"));}
 },[doc,hydrated]);
 const endDragging=(event:PointerEvent<SVGSVGElement>)=>{
  if(!drag.current||drag.current.pointerId!==event.pointerId)return;
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const onPointerMove=(event:PointerEvent<SVGSVGElement>)=>{
  if(!drag.current||event.pointerId!==drag.current.pointerId)return;
  const p=svgCoordinates(event);if(!p)return;
  if(drag.current.kind==="pan"){
   const delta={x:p.x-drag.current.last.x,y:p.y-drag.current.last.y};
   drag.current.last=p;
   setView(v=>({...v,ox:v.ox+delta.x,oy:v.oy+delta.y}));
  }else{
   const id=drag.current.id;
   try{commit(movePoint(docRef.current,id,toWorld(p)),false);}catch(e){note(safeError(e));}
  }
 };
 const selectPoint=(id:string)=>{
  if(tool==="move"){setSelected(id);return;}
  if(tool==="point"){setSelected(id);return;}
  if(tool==="polygon"){
   if(polygonVertices.includes(id)){note("顶点不能重复，点击完成按钮闭合多边形");return;}
   setPolygonVertices(v=>[...v,id]);note("已选 "+(polygonVertices.length+1)+" 个顶点");return;
  }
  if(tool==="locus"){
   if(!locusDraft){
    if(docRef.current.objects.find(o=>o.id===id)?.kind!=="point"){note("驱动点必须是可拖动自由点");return;}
    setLocusDraft({driver:id});note("下一步：选择作为运动路径的直线、线段或圆");return;
   }
   if(!locusDraft.path){note("下一步须选择路径线或圆");return;}
   try{
    const created=createLocus(docRef.current,locusDraft.driver,locusDraft.path,id);
    commit(created.document);setSelected(created.id);note("已生成 96 采样点的关联轨迹");
   }catch(e){note(safeError(e));}
   setLocusDraft(null);return;
  }
  if(tool==="intersection"){note("交点工具需要先后选择两条线或圆");return;}
  if(!pending){setPending(id);note("请选择第二个点");return;}
  try{
   const result=createShape(docRef.current,tool,pending,id);
   commit(result.document);setSelected(result.id);setPending(null);note("创建成功："+tool);
  }catch(e){setPending(null);note(safeError(e));}
 };
 const selectShape=(id:string)=>{
  if(tool==="locus"){
   if(!locusDraft){note("请先选择自由驱动点");return;}
   if(locusDraft.path){note("路径已选，请选择目标点");return;}
   setLocusDraft({...locusDraft,path:id});note("最后一步：选择随驱动点变化的目标点");return;
  }
  if(tool!=="intersection"){setSelected(id);note("已选中对象");return;}
  if(!pending){setPending(id);note("请选择第二条线或圆");return;}
  try{
   const result=createIntersections(docRef.current,pending,id);
   if(!result.ids.length)note("这些交点已经存在");
   else{commit(result.document);setSelected(result.ids[0]);note("已创建 "+result.ids.length+" 个关联交点");}
  }catch(e){note(safeError(e));}
  setPending(null);
 };
 const beginPoint=(event:PointerEvent<SVGGElement>,item:Resolved)=>{
  event.stopPropagation();
  if(tool!=="move"){selectPoint(item.object.id);return;}
  setSelected(item.object.id);
  if(item.object.kind!=="point")return;
  if(event.pointerType==="mouse"&&event.button!==0)return;
  const root=svg.current;
  if(!root)return;
  event.preventDefault();root.setPointerCapture(event.pointerId);
  drag.current={kind:"point",id:item.object.id,pointerId:event.pointerId};
  setUndo(items=>[...items.slice(-49),docRef.current]);
  setRedo([]);
 };
 const backgroundPointer=(event:PointerEvent<SVGSVGElement>)=>{
  if(event.target!==svg.current&&!(event.target instanceof SVGRectElement&&event.target.dataset.canvas==="true"))return;
  if(event.pointerType==="mouse"&&event.button!==0)return;
  const p=svgCoordinates(event);if(!p)return;
  if(tool==="move"){
   setSelected(null);
   svg.current?.setPointerCapture(event.pointerId);
   drag.current={kind:"pan",pointerId:event.pointerId,last:p};
  }else if(tool!=="intersection"&&tool!=="locus"){
   try{
    const result=createPoint(docRef.current,toWorld(p));
    if(tool==="point"){commit(result.document);setSelected(result.id);note("已创建自由点");}
    else if(tool==="polygon"){
     commit(result.document);setPolygonVertices(v=>[...v,result.id]);note("已追加新顶点，请继续选择顶点");
    }else{
     // Create a point first, then connect it to the pending first point.
     let next=result.document; const chosen=result.id; let output=chosen;
     if(pending){
      const shape=createShape(next,tool,pending,chosen);
      next=shape.document;output=shape.id;setPending(null);
     }else{setPending(chosen);}
     commit(next);setSelected(output);
     note(pending?"已创建对象":"已创建第一点，请选择第二点");
    }
   }catch(e){note(safeError(e));}
  }
 };
 const zoom=(factor:number)=>{
  setView(v=>{
   const scale=Math.max(17,Math.min(130,v.scale*factor));
   const actualFactor=scale/v.scale;
   return {scale,ox:W/2+(v.ox-W/2)*actualFactor,oy:H/2+(v.oy-H/2)*actualFactor};
  });
 };
 const centered=()=>setView({scale:44,ox:W/2,oy:H/2});
 const exportJson=()=>saveAs("geometry-construction.json","application/json;charset=utf-8",JSON.stringify(docRef.current,null,2));
 const exportSvg=()=>{
  const element=svg.current;if(!element)return;
  const clone=element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  clone.setAttribute("width","960");clone.setAttribute("height","590");
  clone.querySelectorAll("[data-editor-handle]").forEach(el=>el.remove());
  saveAs("geometry-drawing.svg","image/svg+xml;charset=utf-8",new XMLSerializer().serializeToString(clone));
 };
 const importJson=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  try{
   if(file.size>150000)throw Error("文件过大");
   const parsed=parseDocumentJSON(await file.text());
   commit(parsed);setPending(null);setSelected(null);note("已导入并验证 "+parsed.objects.length+" 个对象");
  }catch(e){note("导入失败："+safeError(e));}
 };
 const completePolygon=()=>{
  try{
   const created=createPolygon(docRef.current,polygonVertices);
   commit(created.document);setSelected(created.id);note("多边形已闭合，面积和周长可在属性中查看");
  }catch(e){note(safeError(e));}
  setPolygonVertices([]);
 };
 const deleteSelected=()=>{
  if(!selected)return;
  const removed=doc.objects.length-deleteCascade(doc,selected).objects.length;
  if(!window.confirm("删除该对象及依赖它的 "+(removed-1)+" 个子对象？"))return;
  commit(deleteCascade(docRef.current,selected));setSelected(null);setPending(null);note("已删除 "+removed+" 个对象");
 };
 useEffect(()=>{
  const handler=(e:globalThis.KeyboardEvent)=>{
   const el=e.target as HTMLElement|null;
   if(el&&(["INPUT","TEXTAREA","SELECT"].includes(el.tagName)||el.isContentEditable))return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();if(e.shiftKey)redoAction();else undoAction();}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redoAction();}
  };
  window.addEventListener("keydown",handler);return ()=>window.removeEventListener("keydown",handler);
 });
 const minX=Math.ceil(-view.ox/view.scale)-1,maxX=Math.floor((W-view.ox)/view.scale)+1;
 const minY=Math.ceil((view.oy-H)/view.scale)-1,maxY=Math.floor(view.oy/view.scale)+1;
 const xs=Array.from({length:Math.min(200,Math.max(0,maxX-minX+1))},(_,i)=>minX+i);
 const ys=Array.from({length:Math.min(200,Math.max(0,maxY-minY+1))},(_,i)=>minY+i);
 return <div className={styles.page}>
  <header className={styles.header}>
   <div><p className={styles.eyebrow}>GEOMETRY WORKBENCH · 数学动态作图</p>
    <h1>自由几何编辑器 <span>Geometry Editor</span></h1>
    <p>创建任意位置的点，构造直线、线段和圆；交点由几何计算自动生成，拖动父对象会同步更新整个图形。</p>
   </div>
   <div className={styles.headerActions}>
    <button onClick={undoAction} disabled={!undo.length}>↶ 撤销</button>
    <button onClick={redoAction} disabled={!redo.length}>↷ 重做</button>
    <button onClick={()=>{
     try{
      window.localStorage.setItem("hg-geometry-clipboard-v1",JSON.stringify(validateDocument(docRef.current)));
      note("已将当前作品放入模拟题图形剪贴板。在模拟题详情页选择「插入作品」即可使用。");
     }catch(e){note("共享失败："+safeError(e));}
    }}>送到模拟题</button>
    <button onClick={exportJson}>导出 JSON</button>
    <button onClick={exportSvg}>导出 SVG</button>
    <button onClick={()=>importRef.current?.click()}>导入</button>
    <input hidden ref={importRef} accept=".json,application/json" type="file" onChange={e=>void importJson(e)}/>
   </div>
  </header>
  <div className={styles.tools} role="group" aria-label="绘图工具">
   {TOOLS.map(t=><button key={t.id} type="button" title={t.hint}
    aria-pressed={tool===t.id} className={tool===t.id?styles.toolActive:styles.tool}
    onClick={()=>{setTool(t.id);setPending(null);setPolygonVertices([]);setLocusDraft(null);note(t.hint);}}>{t.name}</button>)}
  </div>
  <div className={styles.layout}>
   <section className={styles.canvasBox}>
    <div className={styles.canvasToolbar}>
     <span>{TOOLS.find(t=>t.id===tool)?.hint}</span>
     <div>
      {tool==="polygon"&&<button disabled={polygonVertices.length<3} onClick={completePolygon}>完成多边形（{polygonVertices.length} 点）</button>}
      <label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/> 网格</label>
      <button onClick={()=>zoom(1.2)} aria-label="放大">＋</button>
      <button onClick={()=>zoom(1/1.2)} aria-label="缩小">－</button>
      <button onClick={centered}>居中</button>
     </div>
    </div>
    <svg ref={svg} viewBox={"0 0 "+W+" "+H} className={styles.canvas}
     role="group" aria-label="交互式几何画布"
     onPointerDown={backgroundPointer} onPointerMove={onPointerMove}
     onPointerUp={endDragging} onPointerCancel={endDragging}
     onLostPointerCapture={()=>{drag.current=null;}}>
     <defs>
      <clipPath id={clipId}><rect width={W} height={H}/></clipPath>
      <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 H 0 V 20" fill="none" stroke="#d8e5ef" strokeWidth=".4"/></pattern>
     </defs>
     <rect width={W} height={H} fill="#f9fcff" data-canvas="true"/>
     <g clipPath={"url(#"+clipId+")"} pointerEvents="none">
      {showGrid&&<>
       {xs.map(x=><g key={"gx"+x}><line x1={toScreen({x,y:0}).x} y1={0} x2={toScreen({x,y:0}).x} y2={H}
        stroke={x===0?"#7893a9":"#e3ebf3"} strokeWidth={x===0?2:1}/>
        {x!==0&&x%2===0&&<text x={toScreen({x,y:0}).x+3} y={Math.min(H-9,Math.max(18,view.oy+17))} fontSize="12" fill="#74889a">{x}</text>}</g>)}
       {ys.map(y=><g key={"gy"+y}><line x1={0} y1={toScreen({x:0,y}).y} x2={W} y2={toScreen({x:0,y}).y}
        stroke={y===0?"#7893a9":"#e3ebf3"} strokeWidth={y===0?2:1}/>
        {y!==0&&y%2===0&&<text x={Math.min(W-35,Math.max(12,view.ox+7))} y={toScreen({x:0,y}).y-4} fontSize="12" fill="#74889a">{y}</text>}</g>)}
      </>}
     </g>
     <g clipPath={"url(#"+clipId+")"}>
      {polygonVertices.length>0&&<polyline points={polygonVertices.map(id=>{
        const p=resolved.find(v=>v.object.id===id)?.point;
        if(!p)return "";
        const q=toScreen(p);return q.x+","+q.y;
       }).filter(Boolean).join(" ")} fill="none" stroke="#ec8d58" strokeWidth="3" strokeDasharray="7 5" pointerEvents="none"/>}
      {resolved.filter(r=>r.object.kind==="locus"&&!r.object.hidden).map(r=>{
       if(r.object.kind!=="locus")return null;
       const paths=locusPaths(sampleLocus(doc,r.object),toScreen);
       return <g key={r.object.id} pointerEvents="none">
        {paths.map((d,i)=><path key={i} d={d} fill="none" stroke={r.object.id===selected?"#ec8d58":"#aa56b4"} strokeWidth="2.6" strokeDasharray="5 3"/>)}
       </g>;
      })}
      {resolved.filter(r=>r.object.kind==="polygon"&&!r.object.hidden&&r.polygon).map(r=>{
       const polygon=r.polygon!;const points=polygon.map(p=>{const q=toScreen(p);return q.x+","+q.y;}).join(" ");
       return <polygon key={r.object.id} points={points} fill="#4eabb42b" stroke={r.object.id===selected?"#e98647":"#20a5a9"} strokeWidth="2.5"
        onPointerDown={e=>{e.stopPropagation();setSelected(r.object.id);}}/>;
      })}
      {resolved.filter(r=>isShape(r.object)&&!r.object.hidden).map(r=>{
       const active=r.object.id===selected||r.object.id===pending;
       const color=active?"#e98647":"#246b9c";
       if(r.circle){
        const c=toScreen(r.circle.center),radius=r.circle.radius*view.scale;
        return <g key={r.object.id} className={styles.shape} onPointerDown={e=>{e.stopPropagation();selectShape(r.object.id);}}>
         <circle cx={c.x} cy={c.y} r={radius} fill="none" stroke="transparent" strokeWidth="16"/>
         <circle cx={c.x} cy={c.y} r={radius} fill="none" stroke={color} strokeWidth="2.8" pointerEvents="none"/>
        </g>;
       }
       if(r.line){
        const a=toScreen(r.line.a),b=toScreen(r.line.b);
        const vx=b.x-a.x,vy=b.y-a.y,d=Math.hypot(vx,vy);
        const delta=1200/d;
        const p=r.object.kind==="segment"?a:{x:a.x-vx*delta,y:a.y-vy*delta};
        const q=r.object.kind==="segment"?b:{x:a.x+vx*delta,y:a.y+vy*delta};
        return <g key={r.object.id} className={styles.shape} onPointerDown={e=>{e.stopPropagation();selectShape(r.object.id);}}>
         <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth="18"/>
         <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={color} strokeWidth="2.7" pointerEvents="none"/>
        </g>;
       }
       return null;
      })}
      {resolved.filter(r=>r.point&&!r.object.hidden).map(r=>{
       const p=toScreen(r.point!);const derived=r.object.kind==="intersection";
       return <g key={r.object.id} className={styles.point}
        onPointerDown={e=>beginPoint(e,r)}>
        <circle cx={p.x} cy={p.y} r="15" fill="transparent"/>
        <circle cx={p.x} cy={p.y} r="5.8"
         fill={derived?"#e88b4b":"#207e97"} stroke="white" strokeWidth="2.2" pointerEvents="none"/>
        {(tool==="move"&&r.object.id===selected)&&<circle cx={p.x} cy={p.y} r="12" stroke="#ef985f" strokeWidth="2" fill="none" pointerEvents="none"/>}
        <text x={p.x+10} y={p.y-10} fontSize="15" fontWeight="750" fill="#23415e" pointerEvents="none">{r.object.label}</text>
       </g>;
      })}
     </g>
    </svg>
    <div role="status" aria-live="polite" className={styles.status}>
     <span>{pending?"已选第一对象，选择第二对象 · ":""}{notice}</span>
     <span>{doc.objects.length}/250 对象 · {Math.round(view.scale/44*100)}% 缩放</span>
    </div>
   </section>
   <aside className={styles.sidebar}>
    <section className={styles.panel}>
     <div className={styles.panelTitle}><h2>对象列表</h2><span>{doc.objects.length}</span></div>
     <div className={styles.objectList}>
      {doc.objects.length===0&&<p className={styles.empty}>暂无对象。选择「点」开始绘制。</p>}
      {doc.objects.map(o=><div key={o.id} className={o.id===selected?styles.objectSelected:styles.object}>
       <button title={"选择"+o.label} onClick={()=>{setSelected(o.id);note("已选择 "+o.label)}} className={styles.objectName}>
        <span className={styles.objectGlyph}>{o.kind==="circle"?"◯":o.kind==="polygon"?"⬡":o.kind==="locus"?"∿":o.kind==="line"?"⟷":o.kind==="segment"?"━":o.kind==="intersection"?"×":"●"}</span>
        <span><strong>{o.label}</strong><small>{docName(o)}</small></span>
       </button>
       <button className={styles.visibility} title={o.hidden?"显示":"隐藏"} aria-label={(o.hidden?"显示":"隐藏")+o.label}
        onClick={()=>commit(hideObject(docRef.current,o.id,!o.hidden))}>{o.hidden?"◌":"◉"}</button>
      </div>)}
     </div>
    </section>
    <section className={styles.panel}>
     <div className={styles.panelTitle}><h2>对象属性</h2></div>
     {!selectedObject?<p className={styles.empty}>选择画布上的对象，修改名称、自由点坐标或删除关联构造。</p>:
      <div className={styles.inspector}>
       <label>名称<input type="text" maxLength={12} value={selectedObject.label} onChange={e=>{
        try{commit(renameObject(docRef.current,selectedObject.id,e.target.value));}catch{/** allow only nonempty labels */}}}/></label>
       <p className={styles.meta}>{docName(selectedObject)} · {selectedObject.id}</p>
       {selectedObject.kind==="polygon"&&(()=>{const points=resolved.find(v=>v.object.id===selectedObject.id)?.polygon;const m=points?polygonMeasures(points):null;return <p className={styles.meta}>{m?`面积 ${m.area.toFixed(3)} · 周长 ${m.perimeter.toFixed(3)}`:"几何退化：请移动顶点恢复有效多边形"}</p>;})()}
       {selectedObject.kind==="locus"&&<p className={styles.meta}>轨迹通过采样驱动点沿路径移动，并重算其关联目标点获得。拖动父点可更新。</p>}
       {selectedObject.kind==="point"?<div className={styles.xy}>
        {(["x","y"] as const).map(axis=><label key={axis}>{axis.toUpperCase()} 坐标
         <input type="number" step=".25" min="-1000" max="1000" value={selectedObject[axis]}
          onChange={e=>{
           const v=Number(e.target.value);
           if(e.target.value===""||!Number.isFinite(v))return;
           try{commit(movePoint(docRef.current,selectedObject.id,{x:selectedObject.x,y:selectedObject.y,[axis]:v}));}
           catch(error){note(safeError(error));}
          }}/></label>)}
       </div>:selectedObject.kind==="intersection"?
        <p className={styles.meta}>关联交点由父对象自动计算，不能直接拖动。</p>:
        <p className={styles.meta}>拖动此对象依赖的自由点，即可更新形状。</p>}
       {(selectedObject.kind==="line"||selectedObject.kind==="segment")&&(()=>{
         const g=resolved.find(v=>v.object.id===selectedObject.id)?.line;
         if(!g)return null;
         const dx=g.b.x-g.a.x,dy=g.b.y-g.a.y;
         const sq=dx*dx+dy*dy;
         return <div className={styles.meta}>
          <p>长度：{Math.sqrt(sq).toFixed(3)}；距离²：{sq.toFixed(3)}</p>
          <button type="button" className={styles.visibility} style={{width:"auto",fontWeight:700,textDecoration:"underline"}} onClick={()=>{
           const fixed=(v:number)=>Number(v.toFixed(4));
           const expr=`(${fixed(dx)})^2+(${fixed(dy)})^2`;
           window.localStorage.setItem("hg-cas-input-v1",expr);
           router.push("/math-studio");
          }}>发送两点距离²到 CAS 计算</button>
         </div>;
       })()}
       {(selectedObject.kind==="segment"||selectedObject.kind==="line"||selectedObject.kind==="circle")&&
         <MeasureControl key={selectedObject.id} object={selectedObject} resolved={resolved}
          onApply={target=>{
           try{commit(resizeMeasuredObject(docRef.current,selectedObject.id,target));note("已修改定位尺寸，相关交点和图形重新计算");}
           catch(e){note(safeError(e));}
          }}/>}
       {(selectedObject.kind==="segment"||selectedObject.kind==="line")&&
        <AngleControl object={selectedObject} resolved={resolved} onApply={degree=>{
         try{commit(rotateMeasuredObject(docRef.current,selectedObject.id,degree));note("方向角已更新，依赖图形同步重算");}
         catch(error){note(safeError(error));}
        }}/>} 
       <button className={styles.delete} onClick={deleteSelected}>删除对象及依赖项</button>
      </div>}
    </section>
    <section className={styles.help}>
     <strong>作图提示</strong>
     <p>直线无限延长，线段保留端点范围。选择「交点」后依次点击两条线或圆，会计算线线、线圆、圆圆交点；平行线、相离圆不会生成虚假交点。</p>
     <p>更改自由点时，所有依赖它的交点和后续图形自动更新。支持撤销、重做、JSON 本地保存及 SVG 导出。</p>
     <button onClick={()=>{if(!window.confirm("清空整个画布？建议先导出备份。"))return;commit(blankDocument());setPending(null);setSelected(null);note("画布已清空");}}>清空画布</button>
    </section>
   </aside>
  </div>
  <GeometryTheoremLibrary />
  <p className={styles.footer}>自由几何编辑器属于浏览器端作图工具；与已生成的正式数学模拟题数据隔离。当前支持平面欧氏点、直线、线段、圆及有限交点，不包含 GeoGebra 的全部符号代数、三维和 CAS 功能。</p>
 </div>;
}
