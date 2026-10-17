/** Reproducible high-school conic calculations in canonical coordinates.
 * Ellipse x²/a²+y²/b²=1 (a>b>0).
 * Hyperbola x²/a²-y²/b²=1.
 * Parabola y²=4px (p>0), opening right.
 */
export type ConicKind="ellipse"|"hyperbola"|"parabola";
export type V2={x:number;y:number};
export type ConicModel={kind:ConicKind;a:number;b:number;p:number};
export type Secant={point:V2;slope:number};
export type IntersectionResult={points:V2[];status:"secant"|"tangent"|"none"|"single-not-tangent"|"coincident";discriminant:number;chord:number|null;equation:string};
export function validateConic(c:ConicModel){
 if(![c.a,c.b,c.p].every(Number.isFinite)||c.a<=0||c.b<=0||c.p<=0||c.a>30||c.b>30||c.p>30)throw Error("圆锥曲线参数必须为0–30间正数");
 if(c.kind==="ellipse"&&c.a<=c.b)throw Error("椭圆必须a>b>0");
 if(!["ellipse","hyperbola","parabola"].includes(c.kind))throw Error("未知圆锥曲线");
 return c;
}
export function conicEquation(c:ConicModel):string{
 validateConic(c);
 const fmt=(x:number)=>Number(x.toFixed(4)).toString();
 if(c.kind==="parabola")return `y² = ${fmt(4*c.p)}x`;
 return `x²/${fmt(c.a*c.a)} ${c.kind==="ellipse"?"+":"−"} y²/${fmt(c.b*c.b)} = 1`;
}
export function conicFoci(c:ConicModel):V2[]{
 validateConic(c);
 if(c.kind==="parabola")return [{x:c.p,y:0}];
 const focus=Math.sqrt(c.a*c.a+(c.kind==="ellipse"?-1:1)*c.b*c.b);
 return [{x:-focus,y:0},{x:focus,y:0}];
}
export function conicEccentricity(c:ConicModel):number{
 return c.kind==="parabola"?1:Math.abs(conicFoci(c)[1].x)/c.a;
}
export function pointOnConic(c:ConicModel,t:number):V2{
 validateConic(c);
 if(c.kind==="ellipse")return {x:c.a*Math.cos(t),y:c.b*Math.sin(t)};
 if(c.kind==="hyperbola")return {x:c.a*Math.cosh(t),y:c.b*Math.sinh(t)};
 return {x:c.p*t*t,y:2*c.p*t};
}
export function conicCurves(c:ConicModel):V2[][]{
 validateConic(c);
 const N=160;
 if(c.kind==="ellipse")return [Array.from({length:N+1},(_,i)=>pointOnConic(c,i/N*Math.PI*2))];
 if(c.kind==="hyperbola"){
  const half=Array.from({length:N+1},(_,i)=>pointOnConic(c,-1.45+i/N*2.9));
  return [half,half.map(q=>({x:-q.x,y:q.y}))];
 }
 return [Array.from({length:N+1},(_,i)=>pointOnConic(c,-2.35+i/N*4.7))];
}
export function conicValue(c:ConicModel,v:V2):number{
 if(c.kind==="parabola")return v.y*v.y-4*c.p*v.x;
 return v.x*v.x/(c.a*c.a)+(c.kind==="ellipse"?1:-1)*v.y*v.y/(c.b*c.b)-1;
}
function roots(A:number,B:number,C:number):{t:number[];disc:number;kind:"quadratic"|"linear"|"all"}{
 const scale=Math.max(1,Math.abs(A),Math.abs(B),Math.abs(C)),tol=1e-10*scale;
 if(Math.abs(A)<=tol){
  if(Math.abs(B)<=tol)return {t:[],disc:0,kind:"all"};
  return {t:[-C/B],disc:0,kind:"linear"};
 }
 const disc=B*B-4*A*C;
 if(disc<-tol)return {t:[],disc,kind:"quadratic"};
 if(Math.abs(disc)<=tol)return {t:[-B/(2*A)],disc:0,kind:"quadratic"};
 // Numerically stable quadratic formula; avoid cancellation in near-asymptotic intersections.
 const sqrt=Math.sqrt(disc);
 const q=-.5*(B+Math.sign(B||1)*sqrt);
 const xs=q===0?[-B/(2*A)]:[q/A,C/q];
 return {t:xs.sort((x,y)=>x-y),disc,kind:"quadratic"};
}
export function intersectConicLine(c:ConicModel,sec:Secant):IntersectionResult{
 validateConic(c);
 const {point:{x:x0,y:y0},slope:m}=sec;
 if(![x0,y0,m].every(Number.isFinite)||Math.max(Math.abs(x0),Math.abs(y0),Math.abs(m))>100)throw Error("坐标或斜率超出可视范围");
 // Parametrize line L(t)=(x0+t,y0+mt) for a through-point guarantee.
 const sign=c.kind==="hyperbola"?-1:1;
 const A=c.kind==="parabola"?m*m:1/(c.a*c.a)+sign*m*m/(c.b*c.b);
 const B=c.kind==="parabola"?2*y0*m-4*c.p:2*x0/(c.a*c.a)+2*sign*y0*m/(c.b*c.b);
 const C=c.kind==="parabola"?y0*y0-4*c.p*x0:x0*x0/(c.a*c.a)+sign*y0*y0/(c.b*c.b)-1;
 const found=roots(A,B,C);
 if(found.kind==="all")return {points:[],status:"coincident",discriminant:0,chord:null,equation:conicEquation(c)};
 const points=found.t.map(t=>({x:x0+t,y:y0+m*t})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 const status=points.length===0?"none":points.length===2?"secant":found.kind==="quadratic"?"tangent":"single-not-tangent";
 const chord=points.length===2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):null;
 return {points,status,discriminant:found.disc,chord,equation:conicEquation(c)};
}
export function throughPointLine(sec:Secant){
 const {x,y}=sec.point,m=sec.slope;
 const b=y-m*x;
 return {intercept:b,equation:`y = ${Number(m.toFixed(3))}(x − ${Number(x.toFixed(3))}) + ${Number(y.toFixed(3))}`};
}
export function conicExamFacts(c:ConicModel,sec:Secant):string[]{
 const intersection=intersectConicLine(c,sec),foci=conicFoci(c);
 const facts=[
  `标准方程：${conicEquation(c)}`,
  `焦点：${foci.map(f=>`(${Number(f.x.toFixed(3))}, ${Number(f.y.toFixed(3))})`).join("、")}`,
  `离心率 e = ${Number(conicEccentricity(c).toFixed(4))}`,
  `直线过 P(${sec.point.x},${sec.point.y})：${throughPointLine(sec).equation}`,
  `联立判别量 Δ = ${Number(intersection.discriminant.toFixed(5))}；交点数 = ${intersection.points.length}`,
 ];
 if(intersection.chord!==null)facts.push(`截得弦长 |AB| = ${intersection.chord.toFixed(4)} = √[(x₁−x₂)²+(y₁−y₂)²]`);
 if(intersection.status==="single-not-tangent")facts.push("此处退化为一次方程，唯一交点不等于相切（如平行对称轴/渐近线的方向）。");
 return facts;
}
