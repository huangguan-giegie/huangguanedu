"use client";
import type {GeometryDocument,Point} from "../lib/free-geometry";
import {resolveDocument,polygonMeasures} from "../lib/free-geometry";
import {sampleLocus,locusPaths} from "../lib/geometry-locus";

/** Deliberately renders validated drawing primitives, NOT arbitrary SVG
 * HTML. Angles/answers in the original practice problem remain authoritative. */
export function AttachedGeometryFigure({document}:{document:GeometryDocument}){
 const resolved=resolveDocument(document);
 const points:Point[]=[];
 for(const r of resolved){
  if(r.point)points.push(r.point);
  if(r.circle){
   const c=r.circle.center,k=r.circle.radius;
   points.push({x:c.x-k,y:c.y-k},{x:c.x+k,y:c.y+k});
  }
  if(r.polygon)points.push(...r.polygon);
 }
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const minX=Math.min(...xs,0),maxX=Math.max(...xs,0),minY=Math.min(...ys,0),maxY=Math.max(...ys,0);
 const unit=Math.min(520/Math.max(2,maxX-minX),290/Math.max(2,maxY-minY),65);
 const project=(p:Point)=>({x:320+(p.x-(minX+maxX)/2)*unit,y:175-(p.y-(minY+maxY)/2)*unit});
 const line=(a:Point,b:Point,infinite:boolean)=>{
  const p=project(a),q=project(b);
  if(!infinite)return {p,q};
  const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy);
  if(len<1e-6)return {p,q};
  return {p:{x:p.x-900*dx/len,y:p.y-900*dy/len},q:{x:q.x+900*dx/len,y:q.y+900*dy/len}};
 };
 return <figure className="practice-diagram">
  <svg viewBox="0 0 640 350" role="img" className="w-full max-w-[640px]"
   aria-label="经老师检查并附加的自定义几何作图">
   <defs><clipPath id="attached-geometry-viewport"><rect x="8" y="8" width="624" height="334"/></clipPath></defs>
   <rect x="0" y="0" width="640" height="350" fill="#f8fbfe" rx="8"/>
   <g clipPath="url(#attached-geometry-viewport)">
    {resolved.filter(v=>!v.object.hidden).map(v=>{
     if(v.line){
      const {p,q}=line(v.line.a,v.line.b,v.object.kind==="line");
      return <line key={v.object.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#245673" strokeWidth="2.5"/>;
     }
     if(v.circle){
      const c=project(v.circle.center);
      return <circle key={v.object.id} cx={c.x} cy={c.y} r={v.circle.radius*unit}
       stroke="#2b8a99" strokeWidth="2.5" fill="none"/>;
     }
     if(v.polygon){
      const p=v.polygon.map(pt=>{const s=project(pt);return s.x+","+s.y;}).join(" ");
      return <polygon key={v.object.id} points={p} fill="#a4d6e52c" stroke="#258a96" strokeWidth="2.4"
       aria-label={`多边形，面积 ${polygonMeasures(v.polygon).area.toFixed(2)}`}/>;
     }
     if(v.object.kind==="locus"){
      return <g key={v.object.id}>{locusPaths(sampleLocus(document,v.object),project).map((d,i)=>
       <path key={i} d={d} fill="none" stroke="#ca7956" strokeWidth="2" strokeDasharray="6 4"/>)}</g>;
     }
     return null;
    })}
    {resolved.filter(v=>!v.object.hidden&&v.point).map(v=>{
     const p=project(v.point!);
     return <g key={v.object.id}><circle cx={p.x} cy={p.y} r="3.8" fill="#26435b"/>
      <text x={p.x+8} y={p.y-9} fill="#243c54" fontSize="14" fontWeight="700">{v.object.label}</text></g>;
    })}
   </g>
  </svg>
  <figcaption>自定义教学配图 · 人工确认用途，不替代原题条件、答案或证明。</figcaption>
 </figure>;
}
