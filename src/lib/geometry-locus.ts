import {
  movePoint,resolveDocument,type GeometryDocument,type GeometryObject,type Point,
} from "./free-geometry";

/** Sample a dependent target point as a FREE driver point follows a fixed
 * segment, infinite line (bounded 12-unit range), or circle. Unlike a trace of
 * mouse events, this curve is reproducible and recalculated after edits.
 */
export function sampleLocus(document:GeometryDocument,object:Extract<GeometryObject,{kind:"locus"}>):(Point|null)[]{
 const base=resolveDocument(document);
 const map=new Map(base.map(x=>[x.object.id,x]));
 const path=map.get(object.path),driver=map.get(object.driver);
 if(!driver?.point||driver.object.kind!=="point"||!path||(path.object.kind!=="line"&&path.object.kind!=="segment"&&path.object.kind!=="circle"))return [];
 const samples=Math.min(160,Math.max(24,object.samples));
 const start:Point[]=[];
 if(path.circle){
  const {center,radius}=path.circle;
  for(let i=0;i<=samples;i++){
   const t=2*Math.PI*i/samples;
   start.push({x:center.x+radius*Math.cos(t),y:center.y+radius*Math.sin(t)});
  }
 }else if(path.line){
  const {a,b}=path.line,dx=b.x-a.x,dy=b.y-a.y;
  const len=Math.hypot(dx,dy);
  if(len<1e-9)return [];
  const segment=path.object.kind==="segment";
  for(let i=0;i<=samples;i++){
   const t=segment?i/samples:(i/samples-.5)*12/len;
   start.push({x:a.x+t*dx,y:a.y+t*dy});
  }
 }
 return start.map(p=>{
  try{
   const moved=movePoint(document,object.driver,p);
   const resolved=resolveDocument(moved).find(v=>v.object.id===object.target)?.point;
   return resolved && Number.isFinite(resolved.x)&&Number.isFinite(resolved.y)?resolved:null;
  }catch{return null;}
 });
}
/** Break across undefined points, rather than joining disconnected branches. */
export function locusPaths(samples:(Point|null)[],project:(p:Point)=>Point):string[]{
 const paths:string[]=[];let current:string[]=[];
 const flush=()=>{if(current.length>1)paths.push(current.join(" "));current=[];};
 for(const p of samples){
  if(!p){flush();continue;}
  const v=project(p);
  if(!Number.isFinite(v.x)||!Number.isFinite(v.y)){flush();continue;}
  current.push((current.length?"L":"M")+v.x.toFixed(2)+" "+v.y.toFixed(2));
 }
 flush();return paths;
}
