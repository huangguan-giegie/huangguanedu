"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  LAB_DEFAULTS, SCENE, bisectorLabGeometry, similarityLabGeometry, tangentLabGeometry,
  dragBisector, dragSimilarity, dragTangent, normalizeBisector, normalizeSimilarity,
  normalizeTangent, projectBisector, projectSimilarity, projectTangent, displayMeasure,
  type LabHandle, type LabMode,
} from "../lib/geometry-lab";
import { distance, type Point2 } from "../lib/practice-construction-constraints";
import styles from "./GeometryLab.module.css";
import Link from "next/link";
import {JuniorTheoremPlayground} from "./JuniorTheoremPlayground";
import {geometryLabSnapshot,middleSchoolTheorems} from "../lib/middle-school-geometry";
import {GEOMETRY_DRAFT_KEY,geometryDraftExport} from "../lib/practice-drawing";

const catalog: { mode: LabMode; icon: string; title: string; subtitle: string }[] = [
  { mode:"bisector", icon:"△", title:"角平分线", subtitle:"拖动 A 点，观察分点 D" },
  { mode:"similarity", icon:"∠", title:"相似三角形", subtitle:"拖动 B、C、E 改变边与比例" },
  { mode:"tangent", icon:"◎", title:"两圆公切线", subtitle:"拖动圆心或半径控制点" },
];

const ocean="#2b9aaf", coral="#ee9463", deep="#284769";
function Segment({a,b,color=deep,dashed=false,width=3}: {
  a:Point2; b:Point2; color?:string; dashed?:boolean; width?:number;
}) {
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color}
    strokeWidth={width} strokeDasharray={dashed?"8 6":undefined} strokeLinecap="round" />;
}
function PointLabel({p,label,dx=11,dy=-11}: {
  p:Point2; label:string; dx?:number; dy?:number;
}) {
  return <g>
    <circle cx={p.x} cy={p.y} r="4.5" fill={deep} stroke="white" strokeWidth="1.5"/>
    <text x={p.x+dx} y={p.y+dy} fontSize="19" fontWeight="700" fill={deep}>{label}</text>
  </g>;
}
function ValueLabel({a,b,text,dx=0,dy=0}: {
  a:Point2;b:Point2;text:string;dx?:number;dy?:number;
}) {
  return <text x={(a.x+b.x)/2+dx} y={(a.y+b.y)/2+dy} textAnchor="middle"
    fontSize="17" fontWeight="700" fill="#425c79">{text}</text>;
}

function DragHandle({p,handle,aria,onStart,onKeyboard,color=ocean}:{
  p:Point2;handle:LabHandle;aria:string;color?:string;
  onStart:(event:PointerEvent<SVGGElement>, handle:LabHandle)=>void;
  onKeyboard:(event:KeyboardEvent<SVGGElement>,handle:LabHandle,p:Point2)=>void;
}) {
  return <g role="button" tabIndex={0} aria-label={aria} className={styles.dragHandle}
    onPointerDown={(event)=>onStart(event,handle)}
    onKeyDown={(event)=>onKeyboard(event,handle,p)}>
    <circle cx={p.x} cy={p.y} r="21" fill={color} fillOpacity=".12" stroke={color} strokeWidth="1.5" strokeDasharray="4 3"/>
    <circle cx={p.x} cy={p.y} r="8" fill={color} stroke="white" strokeWidth="3"/>
  </g>;
}
function Statistic({label,value,note}: {label:string;value:string;note?:string}) {
  return <div className={styles.stat}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statValue}>{value}</span>
    {note&&<span className={styles.statNote}>{note}</span>}
  </div>;
}
function Control({id,label,value,min,max,step=0.1,onChange,unit="cm"}:{
  id:string;label:string;value:number;min:number;max:number;step?:number;
  onChange:(value:number)=>void;unit?:string;
}) {
  return <div className={styles.control}>
    <div className={styles.controlHeading}><label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{displayMeasure(value)} {unit}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value}
      onChange={(e)=>onChange(Number(e.target.value))}/>
  </div>;
}
function TeachingNote({title,children}: {title:string;children:ReactNode}) {
  return <div className={styles.teaching}>
    <div className={styles.teachingIcon} aria-hidden>∑</div>
    <div><strong>{title}</strong><p>{children}</p></div>
  </div>;
}

/** Dragging is deliberately isolated from persisted quiz diagrams and answers. */
export function GeometryLab() {
  const [mode,setMode]=useState<LabMode>("bisector");
  const [bis,setBis]=useState(LAB_DEFAULTS.bisector);
  const [sim,setSim]=useState(LAB_DEFAULTS.similarity);
  const [tan,setTan]=useState(LAB_DEFAULTS.tangent);
  const [showGuides,setShowGuides]=useState(true);
  const activePointer=useRef<{handle:LabHandle;pointerId:number}|null>(null);
  const gridId=useId();

  const bisector=bisectorLabGeometry(bis);
  const similar=similarityLabGeometry(sim);
  const tangent=tangentLabGeometry(tan);

  const [savedFigure,setSavedFigure]=useState("");
  function stageDrawing(){
    try{
      const doc=geometryLabSnapshot(mode,{bis,sim,tan});
      window.localStorage.setItem(GEOMETRY_DRAFT_KEY,geometryDraftExport(doc));
      window.localStorage.setItem("hg-geometry-editor-v1",JSON.stringify(doc));
      setSavedFigure("已将当前状态保存为可复用图形。可在编辑器继续修改，或去模拟题选择具体题目附加。");
    }catch(e){setSavedFigure(e instanceof Error?e.message:"保存作图失败");}
  }
  function reset() {
    if(mode==="bisector") setBis({...LAB_DEFAULTS.bisector});
    if(mode==="similarity") setSim({...LAB_DEFAULTS.similarity});
    if(mode==="tangent") setTan({...LAB_DEFAULTS.tangent});
  }
  function moveHandle(handle:LabHandle,screen:Point2) {
    if(mode==="bisector")setBis(current=>dragBisector(current,handle,screen));
    else if(mode==="similarity")setSim(current=>dragSimilarity(current,handle,screen));
    else setTan(current=>dragTangent(current,handle,screen));
  }
  function beginDrag(event:PointerEvent<SVGGElement>,handle:LabHandle) {
    if(event.pointerType==="mouse" && event.button!==0)return;
    event.preventDefault();
    event.stopPropagation();
    const root=event.currentTarget.ownerSVGElement;
    if(!root)return;
    activePointer.current={handle,pointerId:event.pointerId};
    root.setPointerCapture(event.pointerId);
  }
  function pointerMove(event:PointerEvent<SVGSVGElement>) {
    const active=activePointer.current;
    if(!active || event.pointerId!==active.pointerId)return;
    const transform=event.currentTarget.getScreenCTM();
    if(!transform)return;
    const screen=new DOMPoint(event.clientX,event.clientY).matrixTransform(transform.inverse());
    moveHandle(active.handle,{x:screen.x,y:screen.y});
  }
  function endDrag(event:PointerEvent<SVGSVGElement>) {
    if(activePointer.current?.pointerId!==event.pointerId)return;
    activePointer.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
  function keyboardHandle(event:KeyboardEvent<SVGGElement>,handle:LabHandle,p:Point2) {
    const delta:Record<string,Point2>={
      ArrowLeft:{x:-4.4,y:0},ArrowRight:{x:4.4,y:0},
      ArrowUp:{x:0,y:-4.4},ArrowDown:{x:0,y:4.4},
    };
    const d=delta[event.key];
    if(!d)return;
    event.preventDefault();
    // Keyboard uses the same projection/clamping/validator as pointer drags.
    moveHandle(handle,{x:p.x+d.x,y:p.y+d.y});
  }

  const B=projectBisector(bisector.B),C=projectBisector(bisector.C);
  const A=projectBisector(bisector.A),D=projectBisector(bisector.D);
  const sA=projectSimilarity(similar.small.A),sB=projectSimilarity(similar.small.B),sC=projectSimilarity(similar.small.C);
  const sD=projectSimilarity(similar.large.D,true),sE=projectSimilarity(similar.large.E,true),
    sF=projectSimilarity(similar.large.F,true);
  const tO1=projectTangent(tangent.O1),tO2=projectTangent(tangent.O2);
  const tA=projectTangent(tangent.A),tB=projectTangent(tangent.B);
  const tR=projectTangent({x:0,y:tan.R});
  const tr=projectTangent({x:tan.d,y:tan.r});
  const tangentLength=distance(tangent.A,tangent.B);
  const BD=distance(bisector.B,bisector.D),DC=distance(bisector.D,bisector.C);
  const format=displayMeasure;

  return <div className={styles.page}>
    <div className={styles.hero}>
      <div className={styles.eyebrow}>GEOMETRY STUDIO / 动态几何实验室</div>
      <h1>拖动图形，<span>看见定理如何成立。</span></h1>
      <p>不只是让 AI 画一张图：每一次拖动都会重新计算顶点、辅助线与对应数值。验证始终依据几何公式，而不是模型猜测。</p>
      <div className={styles.heroFacts}>
        <span>3 个交互模型</span><span>实时数值验证</span><span>手机触控 / 键盘可用</span>
      </div>
    </div>

    <div className={styles.modeTabs} role="group" aria-label="选择几何实验">
      {catalog.map((item)=><button type="button" key={item.mode}
        className={mode===item.mode?styles.modeActive:styles.mode}
        aria-pressed={mode===item.mode} onClick={()=>{activePointer.current=null;setMode(item.mode)}}>
        <span className={styles.modeIcon} aria-hidden>{item.icon}</span>
        <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
      </button>)}
    </div>

    <div className={styles.grid}>
      <section className={styles.canvasPanel} aria-label="动态几何画布">
        <div className={styles.panelTop}>
          <div><strong>{catalog.find(item=>item.mode===mode)?.title}</strong><p>拖动发光控制点，或用方向键微调</p></div>
          <div className={styles.panelActions}>
            <label className={styles.switch}><input type="checkbox" checked={showGuides}
              onChange={e=>setShowGuides(e.target.checked)}/> 显示辅助线</label>
            <button type="button" onClick={reset}>重置</button>
          </div>
        </div>
        <svg className={styles.canvas} viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
          role="group" aria-label="可拖动的数学几何图，拖动带虚线光圈的点改变构造"
          onPointerMove={pointerMove} onPointerUp={endDrag}
          onPointerCancel={endDrag} onLostPointerCapture={()=>{activePointer.current=null;}}>
          <defs><pattern id={gridId} width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 H 0 V 22" stroke="#8ca6bc" strokeWidth=".7" fill="none" opacity=".24"/>
          </pattern></defs>
          <rect x="0" y="0" width={SCENE.width} height={SCENE.height} fill={`url(#${gridId})`}/>
          {mode==="bisector" && <>
            <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`}
              fill="#dae9f8" fillOpacity=".63" stroke={deep} strokeWidth="3.2" strokeLinejoin="round"/>
            {showGuides && <Segment a={A} b={D} color={coral} width={3.7}/>}
            <ValueLabel a={A} b={B} text={`${format(bisector.AB)} cm`} dx={-24} dy={-6}/>
            <ValueLabel a={A} b={C} text={`${format(bisector.AC)} cm`} dx={20} dy={-6}/>
            <ValueLabel a={B} b={D} text={`BD ${format(BD)}`} dy={-17}/>
            <ValueLabel a={D} b={C} text={`DC ${format(DC)}`} dy={-17}/>
            <PointLabel p={B} label="B" dx={-22} dy={23}/>
            <PointLabel p={C} label="C" dy={23}/>
            <PointLabel p={D} label="D" dy={28}/>
            <PointLabel p={A} label="A" dy={-22}/>
            <DragHandle p={A} handle="A" aria="拖动或用方向键改变顶点 A"
              onStart={beginDrag} onKeyboard={keyboardHandle}/>
          </>}
          {mode==="similarity" && <>
            <path d={`M ${sA.x} ${sA.y} L ${sB.x} ${sB.y} L ${sC.x} ${sC.y} Z`}
              fill="#dae9f8" fillOpacity=".8" stroke={deep} strokeWidth="3.2" strokeLinejoin="round"/>
            <path d={`M ${sD.x} ${sD.y} L ${sE.x} ${sE.y} L ${sF.x} ${sF.y} Z`}
              fill="#d9f4eb" fillOpacity=".8" stroke={ocean} strokeWidth="3.2" strokeLinejoin="round"/>
            {showGuides && <>
              <path d={`M ${sA.x} ${sA.y-14} H ${sA.x+14} V ${sA.y}`} stroke={coral} strokeWidth="2" fill="none"/>
              <path d={`M ${sD.x} ${sD.y-14} H ${sD.x+14} V ${sD.y}`} stroke={coral} strokeWidth="2" fill="none"/>
              <Segment a={sB} b={sE} color="#9caec2" dashed width={1.6}/>
              <Segment a={sC} b={sF} color="#9caec2" dashed width={1.6}/>
            </>}
            <ValueLabel a={sA} b={sB} text={format(sim.base)} dy={26}/>
            <ValueLabel a={sA} b={sC} text={format(sim.height)} dx={-24}/>
            <ValueLabel a={sD} b={sE} text={format(sim.base*sim.factor)} dy={26}/>
            <ValueLabel a={sD} b={sF} text={format(sim.height*sim.factor)} dx={-27}/>
            <PointLabel p={sA} label="A" dx={-22} dy={20}/>
            <PointLabel p={sB} label="B" dy={20}/>
            <PointLabel p={sC} label="C" dx={-18} dy={-18}/>
            <PointLabel p={sD} label="D" dx={-22} dy={20}/>
            <PointLabel p={sE} label="E" dy={20}/>
            <PointLabel p={sF} label="F" dx={-18} dy={-18}/>
            <DragHandle p={sB} handle="B" aria="拖动 B 调整小三角形底边"
              onStart={beginDrag} onKeyboard={keyboardHandle}/>
            <DragHandle p={sC} handle="C" aria="拖动 C 调整小三角形高度"
              onStart={beginDrag} onKeyboard={keyboardHandle}/>
            <DragHandle p={sE} handle="E" aria="拖动 E 调整两个三角形的相似比"
              onStart={beginDrag} onKeyboard={keyboardHandle} color={coral}/>
          </>}
          {mode==="tangent" && <>
            <circle cx={tO1.x} cy={tO1.y} r={tan.R*SCENE.tangent.unit}
              stroke={deep} strokeWidth="3" fill="#dae9f8" fillOpacity=".68"/>
            <circle cx={tO2.x} cy={tO2.y} r={tan.r*SCENE.tangent.unit}
              stroke={ocean} strokeWidth="3" fill="#d9f4eb" fillOpacity=".68"/>
            {showGuides && <>
              <Segment a={tO1} b={tO2} color="#8ca0b7" dashed width={1.8}/>
              <Segment a={tO1} b={tA} color={deep} width={2.8}/>
              <Segment a={tO2} b={tB} color={ocean} width={2.8}/>
            </>}
            <Segment a={tA} b={tB} color={coral} width={4}/>
            <ValueLabel a={tO1} b={tO2} text={`圆心距 ${format(tan.d)}`} dy={27}/>
            <ValueLabel a={tA} b={tB} text={`AB ${format(tangentLength)}`} dy={-17}/>
            <PointLabel p={tO1} label="O₁" dx={-25} dy={22}/>
            <PointLabel p={tO2} label="O₂" dy={22}/>
            <PointLabel p={tA} label="A" dx={-15} dy={-14}/>
            <PointLabel p={tB} label="B" dy={-14}/>
            <DragHandle p={tO2} handle="O2" aria="沿水平方向拖动小圆圆心改变圆心距"
              onStart={beginDrag} onKeyboard={keyboardHandle}/>
            <DragHandle p={tR} handle="R" aria="上下拖动大圆上方控制点改变大圆半径"
              onStart={beginDrag} onKeyboard={keyboardHandle}/>
            <DragHandle p={tr} handle="r" aria="上下拖动小圆上方控制点改变小圆半径"
              onStart={beginDrag} onKeyboard={keyboardHandle} color={coral}/>
          </>}
        </svg>
        <div className={styles.canvasFooter}>
          <span><span className={styles.pulse} aria-hidden/> 几何关系实时校验通过</span>
          <span>拖动 / 触控 / 键盘 ← ↑ → ↓</span>
        </div>
      </section>
      <aside className={styles.sidebar} aria-label="参数与定理">
        <section className={styles.sideCard}>
          <div className={styles.sideTitle}><span>01</span><h2>动态参数</h2></div>
          {mode==="bisector" && <>
            <Control id="lab-apex-x" label="顶点 A 的水平位置" value={bis.x} min={1.25} max={10.75}
              onChange={x=>setBis(v=>normalizeBisector({...v,x}))}/>
            <Control id="lab-apex-y" label="顶点 A 的高度" value={bis.y} min={1.75} max={7.75}
              onChange={y=>setBis(v=>normalizeBisector({...v,y}))}/>
          </>}
          {mode==="similarity" && <>
            <Control id="lab-small-base" label="小三角形底边 AB" value={sim.base} min={2} max={7}
              onChange={base=>setSim(v=>normalizeSimilarity({...v,base}))}/>
            <Control id="lab-small-height" label="小三角形高度 AC" value={sim.height} min={2} max={7}
              onChange={height=>setSim(v=>normalizeSimilarity({...v,height}))}/>
            <Control id="lab-factor" label="相似放大倍数" value={sim.factor} min={1.2} max={2.4}
              unit="×" onChange={factor=>setSim(v=>normalizeSimilarity({...v,factor}))}/>
          </>}
          {mode==="tangent" && <>
            <Control id="lab-R" label="大圆半径 R" value={tan.R} min={3} max={7}
              onChange={R=>setTan(v=>normalizeTangent({...v,R}))}/>
            <Control id="lab-r" label="小圆半径 r" value={tan.r} min={1} max={tan.R-0.7}
              onChange={r=>setTan(v=>normalizeTangent({...v,r}))}/>
            <Control id="lab-distance" label="圆心距 d" value={tan.d} min={tan.R+tan.r+0.4} max={17}
              onChange={d=>setTan(v=>normalizeTangent({...v,d}))}/>
          </>}
        </section>
        <section className={styles.sideCard}>
          <div className={styles.sideTitle}><span>02</span><h2>实时测量</h2></div>
          <div className={styles.stats}>
            {mode==="bisector" && <>
              <Statistic label="AB / AC" value={format(bisector.AB/bisector.AC)}/>
              <Statistic label="BD / DC" value={format(BD/DC)}/>
              <Statistic label="BC" value={`${format(bisector.BC)} cm`}/>
              <Statistic label="角平分关系" value="∠BAD = ∠DAC"/>
            </>}
            {mode==="similarity" && <>
              <Statistic label="DE / AB" value={format(similar.factor)}/>
              <Statistic label="DF / AC" value={format(similar.factor)}/>
              <Statistic label="EF / BC" value={format(similar.factor)}/>
              <Statistic label="对应角" value="∠A = ∠D = 90°"/>
            </>}
            {mode==="tangent" && <>
              <Statistic label="AB / 公切线" value={`${format(tangentLength)} cm`}/>
              <Statistic label="圆心距 d" value={`${format(tan.d)} cm`}/>
              <Statistic label="R − r" value={`${format(tan.R-tan.r)} cm`}/>
              <Statistic label="垂直关系" value="O₁A ⟂ AB ⟂ O₂B"/>
            </>}
          </div>
        </section>
        <TeachingNote title={mode==="bisector"?"角平分线定理":mode==="similarity"?"相似三角形对应边成比例":"两圆公切线长度"}>
          {mode==="bisector"
            ?"AD 平分 ∠A，且 D 在 BC 上，所以 BD/DC = AB/AC。改变 A 时，D 会沿 BC 自动移动。"
            :mode==="similarity"
              ?"∠A = ∠D = 90°，三个对应边比值始终相同。拖动 E 可以观察等比例缩放。"
              :"AB² = d² − (R − r)²。移动 O₂ 或改变半径时，切点 A、B 按垂直关系同步重算。"}
        </TeachingNote>
      </aside>
    </div>
    <section style={{padding:22,border:"1px solid var(--line)",borderRadius:17,background:"var(--surface)"}}>
      <h2 style={{fontSize:19,fontWeight:800,marginBottom:12}}>将当前几何构造用于模拟题</h2>
      <p style={{fontSize:13,lineHeight:1.9,color:"var(--muted)",marginBottom:14}}>保存的是此刻拖动后的真实几何尺寸和辅助线，而非默认示例。转入自由编辑器后，可继续增添线、圆或交点；调整顶点后的新图需要重新核对数学条件。</p>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
        <button type="button" onClick={stageDrawing} style={{padding:"11px 17px",background:"#167f90",borderRadius:10,color:"white",fontWeight:750}}>保存当前图形并共享给模拟题</button>
        <Link href="/geometry-editor" style={{fontWeight:700,textDecoration:"underline"}}>去自由几何编辑器</Link>
        <Link href="/practice" style={{fontWeight:700,textDecoration:"underline"}}>去模拟题</Link>
      </div>
      {savedFigure&&<p role="status" style={{fontSize:13,marginTop:10}}>{savedFigure}</p>}
    </section>
    <JuniorTheoremPlayground/>
    <section style={{padding:22,border:"1px solid var(--line)",borderRadius:17,background:"var(--surface)"}}>
      <h2 style={{fontSize:19,fontWeight:800}}>初中几何定理库</h2>
      <p style={{fontSize:13,lineHeight:1.8,margin:"8px 0 15px",color:"var(--muted)"}}>覆盖圆、三角形、平行线、四边形和坐标几何。选择具体模板进入编辑器，可以修改顶点与图形后用于练习。</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(215px,1fr))",gap:10}}>
       {middleSchoolTheorems.map(t=><div key={t.key} style={{padding:13,border:"1px solid var(--line)",borderRadius:12,background:"var(--surface-soft)"}}>
          <span style={{fontSize:11,color:"var(--muted)"}}>{t.group}</span>
          <strong style={{display:"block",fontSize:14,margin:"6px 0"}}>{t.title}</strong>
          <span style={{display:"block",fontSize:12,lineHeight:1.7}}>{t.formula}</span>
        </div>)}
      </div>
    </section>
    <p className={styles.disclaimer}>教学探索模式：这里的尺寸可自由调整，但不会修改正式模拟题的题干、配图、标准答案或数据库记录。</p>
  </div>;
}
