"use client";

import { useId, useState } from "react";
import { conicCurves, conicEquation, type ConicKind, type ConicModel, type V2 } from "../lib/exam-conics";
import { ExamConstraintLab } from "./ExamConstraintLab";
import { VerifiedExamCasebook } from "./VerifiedExamCasebook";
import { JilinSquareExam } from "./JilinSquareExam";
import {
  analyzeSimilarity,analyzeQuadratic,analyzeConic,analyzeLineFamily,
  type ExamResult,type SimilarityTarget,type QuadraticTarget,type ConicTarget,
  type LineFamilyInput,
} from "../lib/real-exam-models";
import styles from "./RealExamAuthoringLab.module.css";

type Topic = "squarecase"|"casebook"|"similar"|"quadratic"|"conic"|"lines"|"basic";
const TOPICS:{id:Topic;name:string;subtitle:string}[]=[
  {id:"squarecase",name:"真题 · 几何动点与相似",subtitle:"2025 吉林中考第19题 · 分段面积与定解"},
  {id:"casebook",name:"真题复盘 · 多问综合",subtitle:"2025 吉林中考 + 2024 新高考Ⅰ卷原题结构"},
  {id:"similar",name:"中考 · 相似三角形",subtitle:"平行线分段比例、面积比、动点定值"},
  {id:"quadratic",name:"中考 · 二次函数",subtitle:"抛物线与直线、判别式、韦达、区间最值"},
  {id:"conic",name:"高考 · 圆锥曲线",subtitle:"椭圆/双曲线/抛物线与过点直线"},
  {id:"lines",name:"高考 · 多直线定值",subtitle:"2–4条过定点的直线、弦长与正交不变量"},
  {id:"basic",name:"基础 · 自由度实验",subtitle:"保留旧版入门演示"},
];
const NORMAL_LABELS={none:"无交点",tangent:"相切",secant:"割线",linear:"单交点（非相切）"};
const nice=(n:number)=>Math.abs(n)<1e-8?"0":Number(n.toFixed(3)).toString();
const svgPolyline=(points:V2[],map:(p:V2)=>V2)=>points.map((pt,i)=>{
  const p=map(pt);return `${i?"L":"M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
}).join(" ");

function Field({label,value,onChange,min,max,step=1}:{label:string;value:number;
  onChange:(value:number)=>void;min:number;max:number;step?:number}) {
  const id=useId();
  return <label className={styles.field} htmlFor={id}>
    <div className={styles.fieldTop}><span>{label}</span><strong>{nice(value)}</strong></div>
    <div className={styles.fieldRow}>
      <input id={id} type="range" value={value} min={min} max={max} step={step}
        onChange={event=>onChange(Number(event.target.value))}/>
      <input type="number" aria-label={label+"精确数值"} value={value} min={min} max={max} step={step}
        onChange={event=>{const n=Number(event.target.value);if(event.target.value!==""&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}}/>
    </div>
  </label>;
}
function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
}
function SelectField<T extends string>({label,value,onChange,options}:{label:string;value:T;onChange:(value:T)=>void;options:readonly {value:T;label:string}[]}){
  return <label className={styles.selectField}><span>{label}</span>
    <select value={value} onChange={event=>onChange(event.target.value as T)}>
      {options.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}
    </select>
  </label>;
}
function CoordinateAxes({map}:{map:(p:V2)=>V2}) {
  const X=map({x:0,y:0}),x1=map({x:-100,y:0}),x2=map({x:100,y:0});
  const y1=map({x:0,y:-100}),y2=map({x:0,y:100});
  return <g stroke="#94a9b9" strokeWidth="1.2" opacity=".85">
    <line x1={x1.x} x2={x2.x} y1={X.y} y2={X.y}/>
    <line x1={X.x} x2={X.x} y1={y1.y} y2={y2.y}/>
  </g>;
}
function PlotPoints({points,map,labels}:{points:V2[];map:(p:V2)=>V2;labels?:string[]}) {
  return <g>{points.map((pt,i)=>{const p=map(pt);return <g key={i}>
    <circle cx={p.x} cy={p.y} r="5.6" fill="#e28543" stroke="#fff" strokeWidth="1.8"/>
    <text x={p.x+8} y={p.y-9} fontSize="13" fontWeight="700" fill="#2f536b">{labels?.[i]??`P${i+1}`}</text>
  </g>;})}</g>;
}
function SimilarPlot({base,height,ad,mode,rotation}:{base:number;height:number;ad:number;mode:"parallel"|"rotate";rotation:number}) {
  const theta=(mode==="rotate"?rotation:0)*Math.PI/180;
  const raw=[{x:0,y:0},{x:base,y:0},{x:0,y:height},
    {x:ad*Math.cos(theta),y:ad*Math.sin(theta)},
    {x:-height*ad/base*Math.sin(theta),y:height*ad/base*Math.cos(theta)}];
  const lowX=Math.min(...raw.map(p=>p.x)), highX=Math.max(...raw.map(p=>p.x));
  const lowY=Math.min(...raw.map(p=>p.y)), highY=Math.max(...raw.map(p=>p.y));
  const scale=Math.min(620/Math.max(1,highX-lowX),310/Math.max(1,highY-lowY),39);
  const to=(pt:V2)=>({x:360+(pt.x-(lowX+highX)/2)*scale,y:210-(pt.y-(lowY+highY)/2)*scale});
  const [A,B,C,D,E]=raw.map(to);
  return <svg viewBox="0 0 720 420" role="img" aria-label="平行线 DE 与 BC 构成相似三角形" className={styles.svg}>
    <rect width="720" height="420" fill="#f9fcff"/>
    <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
      fill="#dcecf4" stroke="#2387a4" strokeWidth="3"/>
    <polygon points={`${A.x},${A.y} ${D.x},${D.y} ${E.x},${E.y}`}
      fill="#f5ccab88" stroke="#e5823d" strokeWidth="3"/>
    <path d={`M${A.x} ${A.y-17} h17 v17`} fill="none" stroke="#e5823d" strokeWidth="2"/>
    {([{p:A,name:"A"},{p:B,name:"B"},{p:C,name:"C"},{p:D,name:"D"},{p:E,name:"E"}]).map(({p,name})=><g key={name}>
      <circle cx={p.x} cy={p.y} r="4.5" fill="#234c67"/>
      <text x={p.x+11} y={p.y-12} fill="#294862" fontSize="17" fontWeight="750">{name}</text>
    </g>)}
    <text x={(A.x+B.x)/2} y={A.y+28} fontSize="16" fill="#294862">AB={nice(base)}</text>
    <text x={A.x-68} y={(A.y+C.y)/2} fontSize="16" fill="#294862">AC={nice(height)}</text>
    <text x={(A.x+D.x)/2} y={A.y-12} fontSize="15" fill="#a96330">AD={nice(ad)}</text>
    <text x="484" y="70" fontSize="16" fill="#205b78">{mode==="parallel"?"DE ∥ BC":`旋转角 ${nice(rotation)}°`}</text>
    <text x="484" y="96" fontSize="15" fill="#60798b">△ADE ∼ △ABC</text>
  </svg>;
}
function QuadraticPlot({f,line,left,right,points,vertex,movingPoint}:{f:(x:number)=>number;line:(x:number)=>number;left:number;right:number;points:V2[];vertex:V2;movingPoint:V2|null}) {
  const xs=Array.from({length:161},(_,i)=>-8+i/10);
  const values=xs.flatMap(x=>[f(x),line(x)]);
  let min=Math.min(0,...values),max=Math.max(0,...values);
  if(max-min<2){min-=1;max+=1;}
  const margin=(max-min)*.08;min-=margin;max+=margin;
  const map=(p:V2):V2=>({x:360+p.x*39,y:395-(p.y-min)/(max-min)*370});
  const clipped=useId().replace(/:/g,"");
  return <svg viewBox="0 0 720 420" className={styles.svg} role="img" aria-label="二次函数与一次函数联立交点图形">
    <defs><clipPath id={clipped}><rect width="720" height="420"/></clipPath></defs>
    <rect width="720" height="420" fill="#f9fcff"/>
    <g clipPath={`url(#${clipped})`}>
      <CoordinateAxes map={map}/>
      <path d={svgPolyline(xs.map(x=>({x,y:f(x)})),map)} fill="none" stroke="#188ba6" strokeWidth="3.4"/>
      <path d={svgPolyline(xs.map(x=>({x,y:line(x)})),map)} fill="none" stroke="#d88545" strokeWidth="2.8"/>
      <rect x={map({x:left,y:0}).x} y="0" width={Math.max(0,(right-left)*39)} height="420" fill="#2a9f8530"/>
      <path d={svgPolyline(xs.map(x=>({x,y:f(x)})),map)} fill="none" stroke="#188ba6" strokeWidth="3"/>
      {points.length===2&&movingPoint&&<polygon
        points={[points[0],points[1],movingPoint].map(pt=>{const v=map(pt);return `${v.x},${v.y}`;}).join(" ")}
        fill="#dc95512b" stroke="#e28645" strokeWidth="1.8"/>}
      <PlotPoints points={points} map={map} labels={["A","B"]}/>
      {movingPoint&&<PlotPoints points={[movingPoint]} map={map} labels={["动点 P"]}/>}

      <PlotPoints points={[vertex]} map={map} labels={["顶点"]}/>
    </g>
  </svg>;
}
function ConicPlot({model,through,angles,sections}:{model:ConicModel;through:V2;
  angles:number[];sections:{points:V2[]}[]}) {
  const curves=conicCurves(model);
  const all=curves.flat().concat(sections.flatMap(s=>s.points),[through]);
  const maxX=Math.max(4,Math.abs(through.x)+2,...all.map(v=>Math.abs(v.x)));
  const maxY=Math.max(4,Math.abs(through.y)+2,...all.map(v=>Math.abs(v.y)));
  const scale=Math.min(312/(maxX*1.09),175/(maxY*1.09),38);
  const map=(p:V2)=>({x:360+p.x*scale,y:210-p.y*scale});
  const clipId=useId().replace(/:/g,"");
  const p=map(through);
  const colors=["#e28645","#9b70c6","#429c76","#ca6583"];
  return <svg viewBox="0 0 720 420" className={styles.svg} role="img"
    aria-label="圆锥曲线与多条过定点的直线及交点">
    <defs><clipPath id={clipId}><rect width="720" height="420"/></clipPath></defs>
    <rect width="720" height="420" fill="#f9fcff"/>
    <g clipPath={`url(#${clipId})`}>
      <CoordinateAxes map={map}/>
      {curves.map((curve,i)=><path key={i} d={svgPolyline(curve,map)}
        stroke="#188ba6" strokeWidth="3.2" fill="none"/>)}
      {angles.map((angle,i)=>{const rad=angle*Math.PI/180;
        const dir={x:Math.cos(rad),y:Math.sin(rad)};
        const l=map({x:through.x-dir.x*75,y:through.y-dir.y*75});
        const r=map({x:through.x+dir.x*75,y:through.y+dir.y*75});
        return <g key={i}>
          <line x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke={colors[i%colors.length]}
            strokeWidth="2.4" strokeDasharray={i>1?"7 4":undefined}/>
          <PlotPoints points={sections[i]?.points??[]} map={map}
            labels={sections[i]?.points.map((_,j)=>String.fromCharCode(65+2*i+j))}/>
        </g>;})}
      <circle cx={p.x} cy={p.y} r="6" stroke="#fff" strokeWidth="2" fill="#203f5c"/>
      <text x={p.x+10} y={p.y-12} fill="#203f5c" fontSize="15" fontWeight="800">P</text>
    </g>
  </svg>;
}
const similarityOptions:{value:SimilarityTarget;label:string}[]=[
  {value:"segment",label:"求 DE 长度"},
  {value:"area",label:"求小三角形面积"},
  {value:"trapezoid",label:"求梯形面积"},
  {value:"ratio",label:"求相似比 AD/AB"},
  {value:"fixedRatio",label:"证明 DE/AD 为定值"},
];
const quadraticOptions:{value:QuadraticTarget;label:string}[]=[
  {value:"count",label:"求两函数交点个数"},
  {value:"sum",label:"求两交点横坐标之和"},
  {value:"chord",label:"求两交点间的弦长"},
  {value:"vertex",label:"求抛物线顶点"},
  {value:"max",label:"求闭区间最大值"},
  {value:"min",label:"求闭区间最小值"},
  {value:"areaMax",label:"动点 P 与交点 A、B 构成三角形的最大面积"},
];
const conicOptions:{value:ConicTarget;label:string}[]=[
  {value:"count",label:"交点个数（含无解）"},
  {value:"chord",label:"交点 A、B 的弦长"},
  {value:"midpoint",label:"AB 中点坐标"},
  {value:"rootSum",label:"参数 t₁+t₂（韦达）"},
  {value:"discriminant",label:"联立方程判别式"},
];

export function RealExamAuthoringLab(){
  const [topic,setTopic]=useState<Topic>("squarecase");
  const [base,setBase]=useState(6),[height,setHeight]=useState(8),[ad,setAd]=useState(3);
  const [lockD,setLockD]=useState(false),[similarTarget,setSimilarTarget]=useState<SimilarityTarget>("fixedRatio");
  const [similarMode,setSimilarMode]=useState<"parallel"|"rotate">("parallel");
  const [rotation,setRotation]=useState(45),[lockRotation,setLockRotation]=useState(false);
  const [a,setA]=useState(1),[h,setH]=useState(1),[v,setV]=useState(-4);
  const [slope,setSlope]=useState(0),[intercept,setIntercept]=useState(0);
  const [left,setLeft]=useState(-2),[right,setRight]=useState(4),[qTarget,setQTarget]=useState<QuadraticTarget>("count");
  const [movement,setMovement]=useState(.5);
  const [kind,setKind]=useState<ConicKind>("ellipse");
  const [ca,setCa]=useState(5),[cb,setCb]=useState(3),[cp,setCp]=useState(2);
  const [pointX,setPointX]=useState(0),[pointY,setPointY]=useState(0);
  const [angles,setAngles]=useState([25,115,65,150]),[numLines,setNumLines]=useState(2);
  const [orthogonal,setOrthogonal]=useState(true);
  const [conicTarget,setConicTarget]=useState<ConicTarget>("chord");
  const [lineTarget,setLineTarget]=useState<LineFamilyInput["target"]>("reciprocal");
  const [openAnswer,setOpenAnswer]=useState(false),[copyInfo,setCopyInfo]=useState("");
  const model:ConicModel={kind,a:ca,b:cb,p:cp};
  const through={x:pointX,y:pointY};
  const activeAngles=angles.slice(0,numLines);
  const effectiveAngles=orthogonal
    ? [activeAngles[0],(activeAngles[0]+90)%180,...activeAngles.slice(2)]
    : activeAngles;
  const similar=analyzeSimilarity({base,height,ad,lockD,target:similarTarget,
    mode:similarMode,rotation,lockRotation});
  const quadratic=analyzeQuadratic({a,h,v,slope,intercept,left,right,target:qTarget,movement});
  const conic=analyzeConic({curve:model,through,angle:angles[0],target:conicTarget});
  const lines=analyzeLineFamily({curve:model,through,angles:activeAngles,perpendicular:orthogonal,target:lineTarget});
  const data:ExamResult=topic==="similar"?similar:topic==="quadratic"?quadratic:topic==="conic"?conic:lines;
  const change=(t:Topic)=>{setTopic(t);setOpenAnswer(false);setCopyInfo("");};
  const setAngle=(i:number,x:number)=>setAngles(prev=>prev.map((v,j)=>i===j?x:v));
  const preset=()=>{
    if(topic==="similar"){setBase(6);setHeight(8);setAd(3);setLockD(true);setSimilarMode("parallel");setRotation(45);setLockRotation(false);setSimilarTarget("segment");}
    if(topic==="quadratic"){setA(1);setH(1);setV(-4);setSlope(0);setIntercept(0);setLeft(-2);setRight(4);setMovement(.5);setQTarget("areaMax");}
    if(topic==="conic"){setKind("ellipse");setCa(5);setCb(3);setCp(2);setPointX(0);setPointY(0);setAngle(0,25);setConicTarget("chord");}
    if(topic==="lines"){setKind("ellipse");setCa(5);setCb(3);setCp(2);setPointX(1);setPointY(1);setAngle(0,25);setOrthogonal(true);setNumLines(3);setLineTarget("reciprocal");}
    setOpenAnswer(false);
  };
  const copy=()=>{
    if(!data.question)return;
    const {question,answer,explanation}=data.question;
    void navigator.clipboard.writeText(`${question}\n\n标准答案：${answer}\n解析：${explanation}`)
      .then(()=>setCopyInfo("题干、答案、解析已复制"))
      .catch(()=>setCopyInfo("无法复制，请手动选择文字"));
  };
  return <div className={styles.page}>
    <header className={styles.hero}>
      <span className={styles.eyebrow}>EXAM AUTHORING / 真题结构驱动的数学命题实验室</span>
      <h1>不只是让数学对象定解，更要模拟中高考综合题的命题条件。</h1>
      <p>以相似、二次函数、圆锥曲线和多条过定点直线为核心。逐项控制参数、交点数量、分支与目标量，区分数值计算和对所有合格构型成立的严格定值证明。</p>
      <small>以真题的考点结构构造原创参数题，不复制真题原文；逐个模型限定算法适用范围。</small>
    </header>
    <div className={styles.topicTabs} role="group" aria-label="考试数学专题">
      {TOPICS.map(t=><button key={t.id} type="button" aria-pressed={topic===t.id}
        className={topic===t.id?styles.activeTopic:styles.topic} onClick={()=>change(t.id)}>
        <strong>{t.name}</strong><small>{t.subtitle}</small></button>)}
    </div>
    {topic==="squarecase"?<JilinSquareExam/>:topic==="casebook"?<VerifiedExamCasebook/>:topic==="basic"?<ExamConstraintLab/>:<>
      <div className={styles.layout}>
        <section className={styles.visual}>
          <div className={styles.heading}><div><strong>01 · 构型与交点</strong>
            <p>所有图元由同一组参数实时计算，图中的交点与解析中所用交点一致。</p></div>
          </div>
          {topic==="similar"?<SimilarPlot base={base} height={height} ad={ad} mode={similarMode} rotation={rotation}/>: 
            topic==="quadratic"?<QuadraticPlot f={quadratic.curve} line={quadratic.line} left={left} right={right}
              points={quadratic.points} vertex={{x:h,y:v}} movingPoint={quadratic.movingPoint}/>: 
              <ConicPlot model={model} through={through} angles={topic==="conic"?[angles[0]]:effectiveAngles}
                sections={topic==="conic"?[conic.section]:lines.sections}/>}
          <div className={styles.stats}>
            <div><small>交点 / 几何状态</small><strong>{data.status}</strong></div>
            <div><small>剩余几何自由度</small><strong>{data.degreesOfFreedom}</strong></div>
            <div><small>当前命题目标</small><strong>{data.target}</strong></div>
          </div>
          <div className={styles.result}><span>{data.invariant?"已证明与指定动参无关的定值":data.value!==null?"当前条件下的目标结果":"尚无法确定目标"}
          </span><strong>{data.value??"条件不足或无定义"}</strong></div>
          <div className={styles.conditionList}><strong>当前题设</strong>
            <ol>{data.conditions.map((condition,i)=><li key={i}>{condition}</li>)}</ol>
          </div>
          {topic==="lines"&&<div className={styles.sections}><strong>每条直线的交点状态</strong>
            {lines.sections.map((section,i)=><p key={i}>
              l{i+1}（{nice(effectiveAngles[i])}°）：{NORMAL_LABELS[section.status]} ·
              弦长 {section.chord===null?"不适用":nice(section.chord)}
            </p>)}
          </div>}
        </section>
        <aside className={styles.sidebar}>
          <section className={styles.panel}>
            <div className={styles.heading}><strong>02 · 命题参数与约束</strong>
              <button type="button" className={styles.reset} onClick={preset}>加载典型题型</button></div>
            {topic==="similar"&&<>
              <SelectField label="相似三角形构型" value={similarMode}
                onChange={n=>{setSimilarMode(n);if(n==="rotate"&&similarTarget==="trapezoid")setSimilarTarget("area");}}
                options={[{value:"parallel",label:"平行线截比（DE∥BC）"},
                  {value:"rotate",label:"共顶点旋转相似（△ADE∽△ABC）"}]}/>
              {similarMode==="rotate"&&<>
                <Field label="绕 A 逆时针旋转角度" value={rotation} min={0} max={180} step={5} onChange={setRotation}/>
                <Check label="将旋转角度写入题设" checked={lockRotation} onChange={setLockRotation}/>
              </>}
              <Field label="大三角形底边 AB" value={base} min={3} max={16}
                onChange={n=>{setBase(n);setAd(t=>Math.min(t,n-1));}}/>
              <Field label="大三角形直角边 AC" value={height} min={2} max={16} onChange={setHeight}/>
              <Field label="动点 D 对应的 AD" value={ad} min={1} max={base-1} onChange={setAd}/>
              <Check label="将 AD 作为题设已知条件" checked={lockD} onChange={setLockD}/>
              <SelectField label="考查目标" value={similarTarget} onChange={setSimilarTarget}
                options={similarityOptions.filter(o=>similarMode==="parallel"||o.value!=="trapezoid")}/>
            </>}
            {topic==="quadratic"&&<>
              <Field label="二次项系数 a（不可为0）" value={a} min={-3} max={3}
                onChange={n=>setA(n===0?(a>0?-1:1):n)}/>
              <Field label="顶点横坐标 h" value={h} min={-5} max={5} onChange={setH}/>
              <Field label="顶点纵坐标 k" value={v} min={-8} max={8} onChange={setV}/>
              <Field label="直线斜率 m" value={slope} min={-5} max={5} onChange={setSlope}/>
              <Field label="直线截距 n" value={intercept} min={-9} max={9} onChange={setIntercept}/>
              <Field label="最值区间左端 L" value={left} min={-8} max={right-1} onChange={setLeft}/>
              <Field label="最值区间右端 R" value={right} min={left+1} max={8} onChange={setRight}/>
              <Field label="动点 P 在两交点横坐标区间的位置" value={movement} min={0} max={1} step={.05} onChange={setMovement}/>
              <SelectField label="考查目标" value={qTarget} onChange={setQTarget} options={quadraticOptions}/>
            </>}
            {(topic==="conic"||topic==="lines")&&<>
              <SelectField label="圆锥曲线类型" value={kind} onChange={setKind} options={[
                {value:"ellipse",label:"椭圆 x²/a²+y²/b²=1"},
                {value:"hyperbola",label:"双曲线 x²/a²−y²/b²=1"},
                {value:"parabola",label:"抛物线 y²=4px"},
              ]}/>
              {kind==="parabola"?<Field label="抛物线焦点参数 p" value={cp} min={1} max={7} onChange={setCp}/>:<>
                <Field label={kind==="ellipse"?"半长轴 a":"实半轴 a"} value={ca} min={3} max={10}
                  onChange={n=>{setCa(n);setCb(t=>Math.min(t,n-1));}}/>
                <Field label={kind==="ellipse"?"半短轴 b":"虚半轴 b"} value={cb} min={1} max={ca-1} onChange={setCb}/>
              </>}
              <Field label="固定点 P 横坐标" value={pointX} min={-8} max={8} step={.5} onChange={setPointX}/>
              <Field label="固定点 P 纵坐标" value={pointY} min={-8} max={8} step={.5} onChange={setPointY}/>
              {topic==="conic"?<>
                <Field label="过 P 的直线方向角（°）" value={angles[0]} min={0} max={175} step={5}
                  onChange={n=>setAngle(0,n)}/>
                <SelectField label="考查目标" value={conicTarget} onChange={setConicTarget} options={conicOptions}/>
              </>:<>
                <Field label="过 P 的直线数量" value={numLines} min={2} max={4} onChange={setNumLines}/>
                <Check label="第1、2条直线正交（垂直）" checked={orthogonal} onChange={setOrthogonal}/>
                {activeAngles.map((angle,i)=><div key={i}>
                  {i===1&&orthogonal?<div className={styles.computedAngle}>第2条直线方向自动确定：{nice(effectiveAngles[1])}°</div>:
                    <Field label={`直线 l${i+1} 的方向角`} value={angle} min={0} max={175} step={5} onChange={n=>setAngle(i,n)}/>}
                </div>)}
                <SelectField label="考查目标" value={lineTarget} onChange={setLineTarget} options={[
                  {value:"reciprocal",label:"前两条弦：倒数积之和"},
                  {value:"chordSum",label:"所有弦长之和"},
                  {value:"chordProduct",label:"所有弦长之积"},
                ]}/>
              </>}
              <div className={styles.formula}>{conicEquation(model)}</div>
            </>}
          </section>
          <section className={styles.panel}>
            <div className={styles.heading}><strong>03 · 数学约束与出题审核</strong></div>
            <div className={styles.notes}>{data.notes.map((note,i)=><p key={i}>{note}</p>)}</div>
            {topic==="lines"&&<p className={styles.notice}>「定值」只在椭圆内定点、前两条直线垂直等前提满足且有严格代数证明时显示；其他配置仅为数值探究。</p>}
            <button className={styles.generate} type="button" disabled={!data.question} onClick={()=>setOpenAnswer(v=>!v)}>
              {openAnswer?"收起题目":"生成当前参数下的原创真题型试题"}
            </button>
            {!data.question&&<p className={styles.notice}>所选目标尚无两个有效交点或约束不足。修改参数或更换目标后即可命题。</p>}
          </section>
        </aside>
      </div>
      {openAnswer&&data.question&&<section className={styles.question}>
        <div className={styles.heading}><strong>04 · 命题预览（{data.question.level}）</strong>
          <button type="button" className={styles.reset} onClick={copy}>复制题干与解析</button></div>
        <p className={styles.questionText}>{data.question.question}</p>
        <details><summary>展开标准答案与推导</summary>
          <p><b>答案：</b>{data.question.answer}</p><p><b>解析：</b>{data.question.explanation}</p>
          {!data.question.exact&&<p className={styles.notice}>部分坐标、长度及角度计算为数值近似值，不应作为符号证明使用。</p>}
        </details>{copyInfo&&<p className={styles.notice} role="status">{copyInfo}</p>}
      </section>}
      <p className={styles.footer}>真题专题改编：参考 2024 苏州中考等官方公开试题与 2024 新高考解析几何真题分类。此处是结构化原创模型，并非原题逐字复现；图形及答案不由 AI 猜测。旧版基础模式、正式练习和学生数据均不修改。</p>
    </>}
  </div>;
}
