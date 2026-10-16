/** Standalone finite, bounded parametric 3D plotter. No WebGL needed. */
export type Vec3={x:number;y:number;z:number};
export type Point2={x:number;y:number;depth:number};
export type SurfaceKind="plane"|"paraboloid"|"saddle"|"sphere"|"torus"|"helix";
export type Plot3D={kind:SurfaceKind;amplitude:number};
export type Camera3D={azimuth:number;elevation:number;scale:number};
export const DEFAULT_CAMERA:Camera3D={azimuth:40,elevation:28,scale:46};
export const SURFACE_LABELS:Record<SurfaceKind,string>={
 plane:"平面 z = a(x + y)/2",
 paraboloid:"抛物面 z = a(x² + y²)/4 - 2",
 saddle:"双曲抛物面 z = a(x² - y²)/4",
 sphere:"球面 x² + y² + z² = 9",
 torus:"环面 R=2, r=0.8",
 helix:"螺旋线 (2cos t, 2sin t, at/4 - 3)",
};
const rad=(n:number)=>n*Math.PI/180;
const safe=(v:number)=>Number.isFinite(v)?v:0;
export function cameraProject(v:Vec3,camera:Camera3D,width=700,height=490):Point2{
 const az=rad(camera.azimuth),el=rad(camera.elevation);
 // Orbit the camera around the vertical z-axis and tilt above the xy plane.
 const horizontal=-v.x*Math.sin(az)+v.y*Math.cos(az);
 const away=v.x*Math.cos(az)+v.y*Math.sin(az);
 const vertical=v.z*Math.cos(el)-away*Math.sin(el);
 const depth=v.z*Math.sin(el)+away*Math.cos(el);
 const unit=Math.min(85,Math.max(14,camera.scale));
 return {x:safe(width/2+unit*horizontal),y:safe(height/2-unit*vertical),depth:safe(depth)};
}
export function build3DLines(plot:Plot3D):Vec3[][]{
 const a=Math.max(-2,Math.min(2,plot.amplitude));
 const lines:Vec3[][]=[];
 const samples=40;
 const sample=(func:(u:number,v:number)=>Vec3,uStart:number,uEnd:number,vStart:number,vEnd:number,uSteps:number,vSteps:number)=>{
  for(let i=0;i<=uSteps;i++){
   const u=uStart+(uEnd-uStart)*i/uSteps;
   lines.push(Array.from({length:samples+1},(_,j)=>func(u,vStart+(vEnd-vStart)*j/samples)));
  }
  for(let i=0;i<=vSteps;i++){
   const v=vStart+(vEnd-vStart)*i/vSteps;
   lines.push(Array.from({length:samples+1},(_,j)=>func(uStart+(uEnd-uStart)*j/samples,v)));
  }
 };
 if(plot.kind==="plane")sample((x,y)=>({x,y,z:a*(x+y)/2}),-3,3,-3,3,10,10);
 else if(plot.kind==="paraboloid")sample((x,y)=>({x,y,z:a*(x*x+y*y)/4-2}),-3,3,-3,3,12,12);
 else if(plot.kind==="saddle")sample((x,y)=>({x,y,z:a*(x*x-y*y)/4}),-3,3,-3,3,12,12);
 else if(plot.kind==="sphere"){
  sample((phi,theta)=>({
   x:3*Math.sin(phi)*Math.cos(theta),
   y:3*Math.sin(phi)*Math.sin(theta),
   z:3*Math.cos(phi),
  }),0,Math.PI,0,2*Math.PI,12,16);
 }else if(plot.kind==="torus"){
  sample((theta,phi)=>({
   x:(2+.8*Math.cos(phi))*Math.cos(theta),
   y:(2+.8*Math.cos(phi))*Math.sin(theta),
   z:.8*Math.sin(phi),
  }),0,2*Math.PI,0,2*Math.PI,18,10);
 }else if(plot.kind==="helix"){
  lines.push(Array.from({length:201},(_,i)=>{
   const t=i/200*6*Math.PI;
   return {x:2*Math.cos(t),y:2*Math.sin(t),z:a*t/4-3};
  }));
 }
 return lines;
}
export function worldAxes(length=3.5):{name:"x"|"y"|"z";from:Vec3;to:Vec3}[]{
 return [
  {name:"x",from:{x:-length,y:0,z:0},to:{x:length,y:0,z:0}},
  {name:"y",from:{x:0,y:-length,z:0},to:{x:0,y:length,z:0}},
  {name:"z",from:{x:0,y:0,z:-length},to:{x:0,y:0,z:length}},
 ];
}
export function plotToSvgPath(points:Vec3[],camera:Camera3D):string{
 return points.map((p,i)=>{
  const v=cameraProject(p,camera);
  return (i===0?"M":"L")+v.x.toFixed(2)+" "+v.y.toFixed(2);
 }).join(" ");
}
