"use client";

import {cyclicDiameterGeometry} from "../lib/cyclic-diameter-geometry";

/** Exact-angle replacement for model-drawn cyclic quadrilateral diagrams. */
export function CyclicDiameterDiagram({obtuseAngle}:{obtuseAngle:number}){
 const g=cyclicDiameterGeometry(obtuseAngle,100);
 const screen=(p:{x:number;y:number})=>({x:240+p.x,y:151-p.y});
 const A=screen(g.A),B=screen(g.B),C=screen(g.C),D=screen(g.D),O=screen(g.O);
 const segments:[[typeof A,typeof B],[typeof A,typeof C],[typeof B,typeof C],[typeof A,typeof D],[typeof D,typeof C],[typeof D,typeof B]]=[
  [A,B],[A,C],[B,C],[A,D],[D,C],[D,B],
 ];
 return <figure className="practice-diagram">
  <svg viewBox="0 0 480 300" role="img" aria-label={`圆内接四边形ABCD，AB为直径，∠ADC严格等于${obtuseAngle}度，∠ACB为90度`} className="w-full max-w-[480px]">
   <circle cx="240" cy="151" r="100" stroke="#385d78" strokeWidth="2.8" fill="#f8fcff"/>
   {segments.map(([p,q],i)=><line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#314e68" strokeWidth="2.5"/>)}
   <circle cx={O.x} cy={O.y} r="3.5" fill="#314e68"/>
   <text x={O.x-6} y={O.y+18} fontSize="16" fill="#243f54">O</text>
   {(["A","B","C","D"] as const).map(label=>{
    const p=screen(g[label]);
    return <g key={label}><circle cx={p.x} cy={p.y} r="4" fill="#1b7c99"/>
     <text x={p.x+(label==="A"?-20:label==="B"?10:0)} y={p.y+(label==="A"||label==="B"?19:-13)}
      fontSize="17" fill="#203d59">{label}</text></g>;
   })}
   <text x={D.x-2} y={D.y+31} fontWeight="700" fontSize="16" fill="#b45836">{obtuseAngle}°</text>
   <path d={`M ${C.x+(A.x-C.x)*.14} ${C.y+(A.y-C.y)*.14} L ${C.x+(A.x-C.x)*.14+(B.x-C.x)*.14} ${C.y+(A.y-C.y)*.14+(B.y-C.y)*.14} L ${C.x+(B.x-C.x)*.14} ${C.y+(B.y-C.y)*.14}`}
    stroke="#c26d40" strokeWidth="1.8" fill="none"/>
  </svg>
  <figcaption>圆周点及角度由统一几何计算生成；∠ADC＝{obtuseAngle}°，AB为直径。</figcaption>
 </figure>;
}
