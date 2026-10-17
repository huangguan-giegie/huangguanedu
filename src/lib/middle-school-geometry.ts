import {constructBisector, constructSimilarity, type Point2} from "./practice-construction-constraints";
import {blankDocument,createPoint,createShape,createPolygon, type GeometryDocument} from "./free-geometry";
import {bisectorLabGeometry,similarityLabGeometry,tangentLabGeometry,type BisectorLabState,type SimilarityLabState,type TangentLabState} from "./geometry-lab";

/** Actual arc positions: AB is a diameter; on the upper semicircle the
 * order is A -> D -> C -> B, not A -> C -> D -> B.
 * ∠ADC is obtuse and intercepts the major AC arc. */
export function diameterCyclicQuadrilateral(adc: number) {
 if(!Number.isFinite(adc)||adc<=90||adc>=180)throw Error("直径上半圆的 ∠ADC 必须为钝角");
 const R=5;
 const degrees=(a:number)=>a*Math.PI/180;
 const polar=(a:number):Point2=>({x:R*Math.cos(degrees(a)),y:R*Math.sin(degrees(a))});
 const angleC=2*adc-180;
 const angleD=(180+angleC)/2;
 const A=polar(180),B=polar(0),C=polar(angleC),D=polar(angleD),O={x:0,y:0};
 const measure=(p:Point2,q:Point2,r:Point2)=>{
  const u={x:p.x-q.x,y:p.y-q.y},v={x:r.x-q.x,y:r.y-q.y};
  const cosine=(u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y));
  return Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
 };
 const angleADC=measure(A,D,C),angleBAC=measure(B,A,C),angleACB=measure(A,C,B);
 if(Math.abs(angleADC-adc)>1e-7||Math.abs(angleBAC-(adc-90))>1e-7||Math.abs(angleACB-90)>1e-7)throw Error("圆周角几何校验失败");
 return {A,B,C,D,O,R,angleADC,angleBAC,angleACB,arcOrder:["A","D","C","B"] as const};
}
export const middleSchoolTheorems=[
 {key:"diameter",title:"直径所对的圆周角",formula:"AB 是直径 ⇒ ∠ACB = 90°",group:"圆"},
 {key:"cyclic",title:"圆内接四边形",formula:"对角互补：∠A + ∠C = 180°",group:"圆"},
 {key:"inscribed",title:"同弧圆周角",formula:"圆周角 = 对应圆心角 ÷ 2",group:"圆"},
 {key:"chord",title:"垂径定理",formula:"OH ⟂ AB ⇒ AH = HB",group:"圆"},
 {key:"tangent",title:"切线性质",formula:"OA ⟂ 切线 PA",group:"圆"},
 {key:"bisector",title:"角平分线定理",formula:"AD 平分∠A ⇒ BD/DC = AB/AC",group:"三角形"},
 {key:"midline",title:"三角形中位线",formula:"MN ∥ BC，MN = BC/2",group:"三角形"},
 {key:"similar",title:"相似三角形",formula:"对应边比例相同，面积比 = 相似比²",group:"三角形"},
 {key:"pythagoras",title:"勾股定理",formula:"a² + b² = c²",group:"三角形"},
 {key:"isosceles",title:"等腰三角形",formula:"AB = AC ⇒ ∠B = ∠C",group:"三角形"},
 {key:"exterior",title:"三角形外角定理",formula:"∠ACD = ∠A + ∠B",group:"三角形"},
 {key:"parallel",title:"平行线同位角",formula:"l₁ ∥ l₂ ⇒ 同位角相等",group:"平行线"},
 {key:"alternate",title:"平行线内错角",formula:"l₁ ∥ l₂ ⇒ 内错角相等",group:"平行线"},
 {key:"complement",title:"邻补角",formula:"邻补角之和 = 180°",group:"基本角"},
 {key:"polygon",title:"多边形内角和",formula:"S = (n - 2) × 180°",group:"多边形"},
 {key:"regular",title:"正多边形内角",formula:"单个内角 = (n - 2) × 180° / n",group:"多边形"},
 {key:"quadrilateral",title:"四边形内角和",formula:"内角和 = 360°",group:"多边形"},
 {key:"sector",title:"扇形面积",formula:"S = (θ/360°)πr²",group:"圆"},
 {key:"arclength",title:"弧长公式",formula:"L = (θ/360°)2πr",group:"圆"},
 {key:"coordinates",title:"两点间距离",formula:"d = √((x₂-x₁)²+(y₂-y₁)²)",group:"解析几何"},
] as const;

/** Export verified lab constructions into the editor's DAG as a *snapshot*.
 * After export, the user may move points freely; no longer claim fixed theorem
 * invariants once the figure is manually edited. */
function fromPoints(items:Record<string,Point2>,segments:[string,string][],circles:[string,string][]=[]):GeometryDocument{
 let document=blankDocument();const ids:Record<string,string>={};
 for(const [name,point] of Object.entries(items)){
  const created=createPoint(document,point);
  document=created.document;
  document={...document,objects:document.objects.map(o=>o.id===created.id?{...o,label:name}:o)};
  ids[name]=created.id;
 }
 for(const [a,b] of segments){document=createShape(document,"segment",ids[a],ids[b]).document;}
 for(const [center,edge] of circles){document=createShape(document,"circle",ids[center],ids[edge]).document;}
 return document;
}
export function geometryLabSnapshot(mode:"bisector"|"similarity"|"tangent"|"diameter",state?:{bis?:BisectorLabState;sim?:SimilarityLabState;tan?:TangentLabState;diameterAngle?:number}):GeometryDocument{
 if(mode==="diameter"){
  const g=diameterCyclicQuadrilateral(state?.diameterAngle??125);
  return fromPoints({A:g.A,B:g.B,C:g.C,D:g.D,O:g.O},[["A","B"],["A","C"],["A","D"],["B","C"],["C","D"]],[["O","A"]]);
 }
 if(mode==="bisector"){
  const g=state?.bis?bisectorLabGeometry(state.bis):constructBisector(6,9,10);
  return fromPoints({A:g.A,B:g.B,C:g.C,D:g.D},[["A","B"],["A","C"],["B","C"],["A","D"]]);
 }
 if(mode==="similarity"){
  const g=state?.sim?similarityLabGeometry(state.sim):constructSimilarity(3,4,2);
  return fromPoints({A:g.small.A,B:g.small.B,C:g.small.C,
   D:{x:g.large.D.x+10,y:g.large.D.y},E:{x:g.large.E.x+10,y:g.large.E.y},F:{x:g.large.F.x+10,y:g.large.F.y}},
   [["A","B"],["A","C"],["B","C"],["D","E"],["D","F"],["E","F"]]);
 }
 const g=state?.tan?tangentLabGeometry(state.tan):tangentLabGeometry({R:5,r:2,d:12});
 const R=g.largeRadius,r=g.smallRadius,d=g.centerDistance;
 return fromPoints({O:g.O1,P:g.O2,A:g.A,B:g.B,R:{x:R,y:0},S:{x:d+r,y:0}},
  [["O","A"],["P","B"],["A","B"],["O","P"]],[["O","R"],["P","S"]]);
}
export function presetGeometry(key:string):GeometryDocument{
 if(["diameter","bisector","similar","tangent"].includes(key))return geometryLabSnapshot(key==="similar"?"similarity":key as "diameter"|"bisector"|"tangent");
 if(key==="pythagoras")return fromPoints({A:{x:0,y:0},B:{x:4,y:0},C:{x:0,y:3}},[["A","B"],["A","C"],["B","C"]]);
 if(key==="midline"){
  return fromPoints({A:{x:0,y:5},B:{x:-5,y:0},C:{x:5,y:0},M:{x:-2.5,y:2.5},N:{x:2.5,y:2.5}},
   [["A","B"],["A","C"],["B","C"],["M","N"]]);
 }
 if(key==="isosceles")return fromPoints({A:{x:0,y:5},B:{x:-4,y:0},C:{x:4,y:0}},[["A","B"],["A","C"],["B","C"]]);
 if(key==="parallel")return fromPoints({A:{x:-5,y:2},B:{x:5,y:2},C:{x:-5,y:-2},D:{x:5,y:-2},E:{x:-2,y:-4},F:{x:2,y:4}},
   [["A","B"],["C","D"],["E","F"]]);
 if(key==="polygon"){
  let doc=fromPoints({A:{x:-4,y:-2},B:{x:3,y:-2},C:{x:5,y:2},D:{x:0,y:5},E:{x:-5,y:2}},[]);
  const p=doc.objects.filter(o=>o.kind==="point");
  doc=createPolygon(doc,p.map(o=>o.id)).document;
  return doc;
 }
 throw Error("不支持的定理模板");
}
