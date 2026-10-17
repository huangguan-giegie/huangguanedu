"use client";
import {diameterCyclicQuadrilateral} from "../lib/middle-school-geometry";
export function DiameterCyclicPracticeDiagram({angleADC}:{angleADC:number}){
 const g=diameterCyclicQuadrilateral(angleADC);
 const pos=(p:{x:number;y:number})=>({x:240+p.x*22,y:160-p.y*22});
 const p=Object.fromEntries((["A","B","C","D","O"] as const).map(k=>[k,pos(g[k])])) as Record<"A"|"B"|"C"|"D"|"O",{x:number;y:number}>;
 const line=(a:keyof typeof p,b:keyof typeof p,color="#243952")=><line x1={p[a].x} y1={p[a].y} x2={p[b].x} y2={p[b].y} stroke={color} strokeWidth="2.8"/>;
 const vertex=(k:keyof typeof p,dx:number,dy:number)=><g key={k}>
  <circle cx={p[k].x} cy={p[k].y} r="3.5" fill="#243952"/>
  <text x={p[k].x+dx} y={p[k].y+dy} fill="#243952" fontSize="18" fontWeight="700">{k}</text>
 </g>;
 return <figure className="practice-diagram">
  <svg role="img" viewBox="0 0 480 300" className="w-full max-w-[480px]"
   aria-label={`圆O的直径AB水平，顺时针上半圆按A、D、C、B排列；∠ADC=${angleADC}度，∠BAC=${g.angleBAC}度`}>
   <circle cx={p.O.x} cy={p.O.y} r={g.R*22} fill="#f6f9fe" stroke="#364c65" strokeWidth="3"/>
   {line("A","B")}{line("A","D")}{line("D","C","#1a829b")}{line("C","B")}
   {line("A","C","#e78952")}
   {/* A small arc drawn using D-A and D-C unit rays; the marked sector itself
       is computed from the verified coordinates, never hard-coded as 125°. */}
   {(()=>{
    const a=g.A,d=g.D,c=g.C;
    const u={x:(a.x-d.x)/Math.hypot(a.x-d.x,a.y-d.y),y:(a.y-d.y)/Math.hypot(a.x-d.x,a.y-d.y)};
    const v={x:(c.x-d.x)/Math.hypot(c.x-d.x,c.y-d.y),y:(c.y-d.y)/Math.hypot(c.x-d.x,c.y-d.y)};
    const scale=22*0.65;
    const start=pos({x:d.x+u.x*.65,y:d.y+u.y*.65});
    const end=pos({x:d.x+v.x*.65,y:d.y+v.y*.65});
    const cross=u.x*v.y-u.y*v.x;
    return <path d={`M ${start.x} ${start.y} A ${scale} ${scale} 0 0 ${cross>0?0:1} ${end.x} ${end.y}`} fill="none" stroke="#ec8251" strokeWidth="2"/>;
   })()}
   <text x={p.D.x+17} y={p.D.y+33} fill="#b8552b" fontSize="14" fontWeight="700">{angleADC}°</text>
   <text x={p.A.x+34} y={p.A.y-15} fill="#137b9b" fontSize="14" fontWeight="700">?</text>
   {vertex("A",-24,6)}{vertex("B",10,6)}{vertex("C",7,-13)}{vertex("D",-17,-12)}{vertex("O",6,20)}
  </svg>
  <figcaption>所有圆周点、125°已知角与待求角，均由同一套圆周角公式计算。</figcaption>
 </figure>;
}
