import {useId} from "react";
import {validateDocument,resolveDocument,type GeometryDocument,type Point} from "../lib/free-geometry";
import {sampleLocus,locusPaths} from "../lib/geometry-locus";

/** Pure read-only rendering of a validated construction. No SVG strings, remote URLs or scripts. */
export function GeometrySnapshot({document}:{document:GeometryDocument}){
 const validated=validateDocument(document);
 const clipId=useId();
 const resolved=resolveDocument(validated);
 const points=resolved.flatMap(r=>[
  ...(r.point?[r.point]:[]),
  ...(r.line?[r.line.a,r.line.b]:[]),
  ...(r.circle?[r.circle.center,{x:r.circle.center.x+r.circle.radius,y:r.circle.center.y},{x:r.circle.center.x-r.circle.radius,y:r.circle.center.y},{x:r.circle.center.x,y:r.circle.center.y+r.circle.radius},{x:r.circle.center.x,y:r.circle.center.y-r.circle.radius}]:[]),
  ...(r.polygon??[]),
 ]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 const minX=Math.min(-1,...points.map(p=>p.x)),maxX=Math.max(1,...points.map(p=>p.x));
 const minY=Math.min(-1,...points.map(p=>p.y)),maxY=Math.max(1,...points.map(p=>p.y));
 const xMid=(minX+maxX)/2,yMid=(minY+maxY)/2;
 const scale=Math.min(19,410/Math.max(1,maxX-minX),230/Math.max(1,maxY-minY));
 const project=(p:Point)=>({x:240+(p.x-xMid)*scale,y:150-(p.y-yMid)*scale});
 const paths=resolved.filter(r=>r.object.kind==="locus"&&!r.object.hidden).flatMap(r=>
  r.object.kind==="locus"?locusPaths(sampleLocus(validated,r.object),project):[]);
 return <figure className="practice-diagram">
  <svg viewBox="0 0 480 300" className="w-full max-w-[480px]" role="img"
   aria-label={`用户创建的动态几何作品静态快照，包含${validated.objects.length}个几何对象`}>
   <rect width="480" height="300" fill="#f9fcff"/>
   <defs><clipPath id={clipId}><rect width="480" height="300"/></clipPath></defs>
   <g clipPath={`url(#${clipId})`} strokeLinecap="round" strokeLinejoin="round">
    {resolved.filter(r=>!r.object.hidden).map(r=>{
     const o=r.object;
     if(r.circle){const p=project(r.circle.center);return <circle key={o.id} cx={p.x} cy={p.y} r={r.circle.radius*scale} fill="none" stroke="#2a708e" strokeWidth="2.4"/>;}
     if(r.line){
      const a=project(r.line.a),b=project(r.line.b),dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);
      const extension=o.kind==="segment"?0:900/n;
      return <line key={o.id} x1={a.x-dx*extension} y1={a.y-dy*extension} x2={b.x+dx*extension} y2={b.y+dy*extension} stroke="#365b78" strokeWidth="2.5"/>;
     }
     if(r.polygon)return <polygon key={o.id} points={r.polygon.map(p=>{const v=project(p);return v.x+","+v.y;}).join(" ")} fill="#73c7c329" stroke="#318f92" strokeWidth="2"/>;
     if(r.point){const p=project(r.point);return <g key={o.id}><circle cx={p.x} cy={p.y} r="4.5" fill="#1d7695"/>
      <text x={p.x+7} y={p.y-7} fontSize="13" fill="#203c55">{o.label}</text></g>;}
     return null;
    })}
    {paths.map((d,i)=><path key={i} d={d} fill="none" stroke="#ad58a5" strokeWidth="2" strokeDasharray="5 3"/>)}
   </g>
  </svg>
  <figcaption>由几何编辑器复用的作品快照，仅用于辅助理解；不参与题目判分。</figcaption>
 </figure>;
}
