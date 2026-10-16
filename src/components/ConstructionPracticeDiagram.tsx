"use client";

import type { AdvancedDiagram } from "../lib/practice-advanced-diagram";
import {
  constructBisector, constructSimilarity, constructExternalTangent,
  type Point2,
} from "../lib/practice-construction-constraints";

type ConstructionDiagram = Extract<AdvancedDiagram,
  {type: "triangle_angle_bisector"|"similar_right_triangles"|"two_circles_external_tangent"}>;
const ink="#23405b", teal="#168f9d", orange="#e68a52";
type ScreenPoint={x:number;y:number};
function P({p,name,dx=8,dy=-9}: {p:ScreenPoint;name:string;dx?:number;dy?:number}) {
  return <g><circle cx={p.x} cy={p.y} r="4" fill="#245c92" stroke="white" strokeWidth="1.5" />
    <text x={p.x+dx} y={p.y+dy} fontSize="15" fontWeight="700" fill={ink}>{name}</text></g>;
}
function Segment({a,b,color=ink,dashed=false,width=2.8}: {
  a:ScreenPoint;b:ScreenPoint;color?:string;dashed?:boolean;width?:number;
}) {
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width}
    strokeLinecap="round" strokeDasharray={dashed?"6 5":undefined}/>;
}
function TextMid({a,b,text,dx=0,dy=0}: {
  a:ScreenPoint;b:ScreenPoint;text:string;dx?:number;dy?:number;
}) {
  return <text x={(a.x+b.x)/2+dx} y={(a.y+b.y)/2+dy}
    textAnchor="middle" fontSize="14" fontWeight="600" fill={ink}>{text}</text>;
}
function Frame({children,caption,description}: {
  children:React.ReactNode;caption:string;description:string;
}) {
  return <figure className="practice-diagram">
    <svg viewBox="0 0 480 300" role="img" aria-label={description} className="w-full max-w-[480px]">{children}</svg>
    <figcaption>{caption}</figcaption>
  </figure>;
}
function RightAngle({p,unit=13}: {p:ScreenPoint;unit?:number}) {
  return <path d={`M ${p.x} ${p.y-unit} H ${p.x+unit} V ${p.y}`}
    fill="none" stroke={orange} strokeWidth="2"/>;
}

/** All SVG coordinates come from the exact same validated constructions as answers. */
export function ConstructionPracticeDiagram({diagram}:{diagram:ConstructionDiagram}) {
  if (diagram.type==="triangle_angle_bisector") {
    const [ab,ac,bc]=diagram.sides.split("-").map(Number);
    const g=constructBisector(ab,ac,bc);
    const minX=Math.min(g.A.x,0),maxX=Math.max(g.A.x,g.C.x);
    const unit=Math.min(350/(maxX-minX),170/g.A.y);
    const x=(value:number)=>65+(value-minX)*unit;
    const y=(value:number)=>246-value*unit;
    const A={x:x(g.A.x),y:y(g.A.y)},B={x:x(g.B.x),y:y(g.B.y)};
    const C={x:x(g.C.x),y:y(g.C.y)},D={x:x(g.D.x),y:y(g.D.y)};
    return <Frame description={`三角形 ABC，AB为${ab}厘米，AC为${ac}厘米，BC为${bc}厘米，AD是A角平分线，D位于BC内部`}
      caption="AD 按角平分线定理计算；角度与边长均经过几何约束校验">
      <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`}
        fill="#edf6fe" stroke={ink} strokeWidth="3"/>
      <Segment a={A} b={D} color={teal} width={3.4}/>
      <TextMid a={A} b={B} text={`${ab} cm`} dx={-16} dy={-5}/>
      <TextMid a={A} b={C} text={`${ac} cm`} dx={16} dy={-5}/>
      <TextMid a={B} b={C} text={`${bc} cm`} dy={34}/>
      <TextMid a={B} b={D} text="?" dy={-10}/>
      <P p={A} name="A" dy={-13}/>
      <P p={B} name="B" dx={-17} dy={18}/>
      <P p={C} name="C" dy={18}/>
      <P p={D} name="D" dy={20}/>
    </Frame>;
  }
  if (diagram.type==="similar_right_triangles") {
    const [base,height]=diagram.smallLegs.split("-").map(Number);
    const g=constructSimilarity(base,height,diagram.factor);
    const largeBase=g.large.E.x,largeHeight=g.large.F.y;
    // Use ONE unit scale for both triangles so similarity is visible, not faked.
    const unit=Math.min(157/largeBase,177/largeHeight);
    const originSmall={x:60,y:252}, originBig={x:258,y:252};
    const project=(p:Point2,origin:ScreenPoint)=>({x:origin.x+p.x*unit,y:origin.y-p.y*unit});
    const A=project(g.small.A,originSmall),B=project(g.small.B,originSmall),C=project(g.small.C,originSmall);
    const D=project(g.large.D,originBig),E=project(g.large.E,originBig),F=project(g.large.F,originBig);
    const unknownBase=diagram.task==="LARGE_BASE";
    return <Frame description={`两个相似直角三角形ABC和DEF，AB为${base}厘米，AC为${height}厘米，较大三角形具有同样的形状和直角`}
      caption="两个直角三角形使用相同像素单位，所有对应边严格按同一倍率缩放">
      <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`} fill="#edf6fe" stroke={ink} strokeWidth="2.7"/>
      <path d={`M ${D.x} ${D.y} L ${E.x} ${E.y} L ${F.x} ${F.y} Z`} fill="#dff4f2" stroke={ink} strokeWidth="2.7"/>
      <RightAngle p={A} unit={8}/><RightAngle p={D}/>
      <TextMid a={A} b={B} text={`${base} cm`} dy={25}/>
      <TextMid a={A} b={C} text={`${height} cm`} dx={-24}/>
      <TextMid a={D} b={E} text={unknownBase?"?":`${base*diagram.factor} cm`} dy={25}/>
      <TextMid a={D} b={F} text={unknownBase?`${height*diagram.factor} cm`:"?"} dx={-29}/>
      <P p={A} name="A" dx={-14} dy={17}/>
      <P p={B} name="B" dy={16}/>
      <P p={C} name="C" dx={-11} dy={-10}/>
      <P p={D} name="D" dx={-14} dy={17}/>
      <P p={E} name="E" dy={16}/>
      <P p={F} name="F" dx={-11} dy={-10}/>
    </Frame>;
  }
  const [largeRadius,smallRadius,centerDistance]=diagram.circles.split("-").map(Number);
  const g=constructExternalTangent(largeRadius,smallRadius,centerDistance);
  const unit=Math.min(296/(centerDistance+smallRadius),87/largeRadius);
  const x=(v:number)=>132+v*unit;
  const y=(v:number)=>185-v*unit;
  const O1={x:x(g.O1.x),y:y(g.O1.y)},O2={x:x(g.O2.x),y:y(g.O2.y)};
  const A={x:x(g.A.x),y:y(g.A.y)},B={x:x(g.B.x),y:y(g.B.y)};
  return <Frame
    description={`两个外离或外切的圆，O₁半径${largeRadius}厘米，O₂半径${smallRadius}厘米，圆心距离${centerDistance}厘米，AB为同侧公切线`}
    caption="A、B 均在相应圆周上；两条切点半径与公切线均垂直">
    <circle cx={O1.x} cy={O1.y} r={largeRadius*unit} stroke="#6d91ad" fill="#f8fbff" strokeWidth="2.6"/>
    <circle cx={O2.x} cy={O2.y} r={smallRadius*unit} stroke="#6d91ad" fill="#f8fbff" strokeWidth="2.6"/>
    <Segment a={O1} b={O2} dashed color="#849bad" width={1.8}/>
    <Segment a={O1} b={A} color={ink}/><Segment a={O2} b={B} color={ink}/>
    <Segment a={A} b={B} color={orange} width={4}/>
    <TextMid a={O1} b={O2} text={`${centerDistance} cm`} dy={20}/>
    <TextMid a={O1} b={A} text={`${largeRadius} cm`} dx={-23}/>
    <TextMid a={O2} b={B} text={`${smallRadius} cm`} dx={26} dy={9}/>
    <TextMid a={A} b={B} text="AB = ?" dy={-16}/>
    <P p={O1} name="O₁" dx={-24} dy={16}/>
    <P p={O2} name="O₂" dy={19}/>
    <P p={A} name="A" dx={-14} dy={-12}/>
    <P p={B} name="B" dy={-10}/>
  </Frame>;
}
