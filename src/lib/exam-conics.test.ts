import {describe,it,expect} from "vitest";
import {
 conicValue,conicCurves,conicFoci,conicEccentricity,intersectConicLine,conicExamFacts,
 type ConicModel,
} from "./exam-conics";
import {sampleFunction} from "../components/FunctionExamExplorer";
import {blankDocument,createPoint,createShape,createIntersections,resolveDocument,resizeMeasuredObject} from "./free-geometry";

describe("高考圆锥曲线与函数图像的确定性计算",()=>{
 const ellipse:ConicModel={kind:"ellipse",a:4,b:2,p:1};
 const hyperbola:ConicModel={kind:"hyperbola",a:4,b:2,p:1};
 const parabola:ConicModel={kind:"parabola",a:4,b:2,p:1};
 it("参数采样每个点都在自身对应的圆锥曲线上",()=>{
  for(const m of [ellipse,hyperbola,parabola])for(const q of conicCurves(m).flat())
   expect(conicValue(m,q)).toBeCloseTo(0,7);
 });
 it("椭圆焦距 c²=a²−b²，双曲线 c²=a²+b²，抛物线焦点(p,0)",()=>{
  const e=conicFoci(ellipse);
  expect(e[1].x**2).toBeCloseTo(12);
  expect(conicEccentricity(ellipse)).toBeCloseTo(Math.sqrt(12)/4);
  expect(conicFoci(hyperbola)[1].x**2).toBeCloseTo(20);
  expect(conicEccentricity(hyperbola)).toBeGreaterThan(1);
  expect(conicFoci(parabola)).toEqual([{x:1,y:0}]);
 });
 it("椭圆割线、相切、相离对应二交、一交、零交",()=>{
  const through=(y:number)=>intersectConicLine(ellipse,{point:{x:0,y},slope:0});
  const secant=through(0);
  expect(secant.status).toBe("secant");
  expect(secant.points.map(x=>x.x)).toEqual([-4,4]);
  expect(secant.chord).toBeCloseTo(8);
  const tangent=through(2);
  expect(tangent.status).toBe("tangent");
  expect(tangent.points).toHaveLength(1);
  expect(tangent.points[0].y).toBeCloseTo(2);
  expect(through(3).status).toBe("none");
 });
 it("双曲线沿渐近线方向可能只有一个交点，但不能误认作切线",()=>{
  const r=intersectConicLine(hyperbola,{point:{x:0,y:1},slope:.5});
  expect(r.status).toBe("single-not-tangent");
  expect(r.points).toHaveLength(1);
  expect(conicValue(hyperbola,r.points[0])).toBeCloseTo(0,7);
 });
 it("抛物线水平方向只有一个交点但不表示相切",()=>{
  const r=intersectConicLine(parabola,{point:{x:0,y:2},slope:0});
  expect(r.points).toHaveLength(1);
  expect(r.status).toBe("single-not-tangent");
  expect(r.points[0]).toEqual({x:1,y:2});
  expect(conicExamFacts(parabola,{point:{x:0,y:2},slope:0}).join(" ")).toContain("不等于相切");
 });
 it("安全拒绝非数值、无效参数和过大斜率",()=>{
  expect(()=>intersectConicLine({...ellipse,a:1,b:2},{point:{x:0,y:0},slope:1})).toThrow();
  expect(()=>intersectConicLine(ellipse,{point:{x:0,y:0},slope:Infinity})).toThrow();
  expect(()=>intersectConicLine(ellipse,{point:{x:0,y:0},slope:1000})).toThrow();
 });
 it("中考二次函数顶点、三角和指对数定义域以同一个安全解析器绘制",()=>{
  const quadratic=sampleFunction("x^2-4x+3");
  expect(quadratic.paths.length).toBeGreaterThan(0);
  expect(quadratic.vertex?.x).toBeCloseTo(2);
  expect(quadratic.vertex?.y).toBeCloseTo(-1);
  for(const f of ["2x-1","6/x","sqrt(x+2)","2sin(x)","cos(2x)","tan(x)","2^x","ln(x)"]){
   const g=sampleFunction(f);
   expect(g.paths.length).toBeGreaterThan(0);
   expect(g.paths.join(" ")).not.toMatch(/NaN|Infinity/);
  }
  expect(()=>sampleFunction("alert(1)")).toThrow();
 });
});

describe("自由编辑器长度与半径数值约束",()=>{
 function setup(){
  let doc=blankDocument();
  const a=createPoint(doc,{x:0,y:0});doc=a.document;
  const b=createPoint(doc,{x:3,y:4});doc=b.document;
  return {doc,a:a.id,b:b.id};
 }
 it("修改线段长度应真正移动自由端点，保持方向且重新计算关联图形",()=>{
  const s=setup();
  const seg=createShape(s.doc,"segment",s.a,s.b);
  const stretched=resizeMeasuredObject(seg.document,seg.id,10);
  const v=resolveDocument(stretched);
  const endpoint=v.find(q=>q.object.id===s.b)?.point;
  expect(endpoint?.x).toBeCloseTo(6);
  expect(endpoint?.y).toBeCloseTo(8);
  const line=v.find(q=>q.object.id===seg.id)?.line;
  expect(Math.hypot(line!.b.x-line!.a.x,line!.b.y-line!.a.y)).toBeCloseTo(10);
 });
 it("修改圆的半径会改变真实圆对象半径与几何构造",()=>{
  const s=setup();
  const circle=createShape(s.doc,"circle",s.a,s.b);
  const next=resizeMeasuredObject(circle.document,circle.id,6);
  const v=resolveDocument(next).find(r=>r.object.id===circle.id)?.circle;
  expect(v?.radius).toBeCloseTo(6);
  expect(resolveDocument(next).find(r=>r.object.id===s.b)?.point).toEqual({x:3.6,y:4.8});
 });
 it("拒绝通过拖动关联交点或伪造负半径破坏约束",()=>{
  const s=setup();
  const c=createPoint(s.doc,{x:3,y:0});let doc=c.document;
  const d=createPoint(doc,{x:0,y:3});doc=d.document;
  const line=createShape(doc,"line",s.a,s.b);doc=line.document;
  const line2=createShape(doc,"line",c.id,d.id);doc=line2.document;
  const intersection=createIntersections(doc,line.id,line2.id);doc=intersection.document;
  const seg=createShape(doc,"segment",s.a,intersection.ids[0]);doc=seg.document;
  expect(()=>resizeMeasuredObject(doc,seg.id,8)).toThrow("关联交点");
  expect(()=>resizeMeasuredObject(doc,line.id,0)).toThrow();
  expect(()=>resizeMeasuredObject(doc,line.id,-5)).toThrow();
 });
});
