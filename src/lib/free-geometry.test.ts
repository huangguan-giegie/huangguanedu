import {describe,expect,it} from "vitest";
import {
  blankDocument,createPoint,createShape,createIntersections,resolveDocument,
  validateDocument,movePoint,renameObject,hideObject,deleteCascade,
  parseDocumentJSON,starterDocument,nextId,type GeometryDocument,
} from "./free-geometry";
type Setup=ReturnType<typeof setup>;
function setup(){
 let doc=blankDocument();
 const A=createPoint(doc,{x:-4,y:0});doc=A.document;
 const B=createPoint(doc,{x:4,y:0});doc=B.document;
 const C=createPoint(doc,{x:0,y:-4});doc=C.document;
 const D=createPoint(doc,{x:0,y:4});doc=D.document;
 return {doc,A:A.id,B:B.id,C:C.id,D:D.id};
}
function pointOf(doc:GeometryDocument,id:string){
 const p=resolveDocument(doc).find(o=>o.object.id===id)?.point;
 if(!p)throw Error("missing point");
 return p;
}
function lines(s:Setup,kind:"line"|"segment"="line"){
 let doc=s.doc;
 const a=createShape(doc,kind,s.A,s.B);doc=a.document;
 const b=createShape(doc,kind,s.C,s.D);doc=b.document;
 return {doc,a:a.id,b:b.id};
}
describe("自由作图：数学交点与依赖图",()=>{
 it("自由点与无限直线相交，移动端点后自动重新计算交点",()=>{
  const s=setup(),l=lines(s);
  let doc=l.doc;
  const result=createIntersections(doc,l.a,l.b);doc=result.document;
  expect(result.ids).toHaveLength(1);
  expect(pointOf(doc,result.ids[0])).toEqual({x:0,y:0});
  doc=movePoint(doc,s.C,{x:2,y:-4});
  doc=movePoint(doc,s.D,{x:2,y:4});
  expect(pointOf(doc,result.ids[0]).x).toBeCloseTo(2);
  expect(pointOf(doc,result.ids[0]).y).toBeCloseTo(0);
  expect(()=>movePoint(doc,result.ids[0],{x:20,y:9})).toThrow("只有自由点");
 });
 it("线-圆两个交点，拖动圆周点后半径与交点全部重算",()=>{
  const {doc:initial,A,B,C,D}=setup();let doc=initial;
  const l=createShape(doc,"line",A,B);doc=l.document;
  // Center C=(0,-4), through D=(0,4): radius 8.
  const c=createShape(doc,"circle",C,D);doc=c.document;
  const first=createIntersections(doc,l.id,c.id);doc=first.document;
  expect(first.ids).toHaveLength(2);
  const p1=pointOf(doc,first.ids[0]),p2=pointOf(doc,first.ids[1]);
  expect(p1.x).toBeCloseTo(-Math.sqrt(48));
  expect(p2.x).toBeCloseTo(Math.sqrt(48));
  expect(p1.y).toBeCloseTo(0);
  doc=movePoint(doc,D,{x:0,y:0}); // Radius 4 tangent to y=0 at origin.
  expect(pointOf(doc,first.ids[0])).toEqual({x:0,y:0});
  expect(resolveDocument(doc).find(x=>x.object.id===first.ids[1])?.point).toBeUndefined();
  // Any dependent line disappears if it references the now-invalid secondary intersection.
  const pt=createPoint(doc,{x:3,y:3});doc=pt.document;
  const dependent=createShape(first.document,"segment",first.ids[1],A);
  expect(resolveDocument(dependent.document).find(x=>x.object.id===dependent.id)?.line).toBeDefined();
  const updated=movePoint(dependent.document,D,{x:0,y:0});
  expect(resolveDocument(updated).find(x=>x.object.id===dependent.id)?.line).toBeUndefined();
 });
 it("圆-圆两个交点与切点，中心移动后动态更新",()=>{
  let doc=blankDocument();
  const a=createPoint(doc,{x:0,y:0});doc=a.document;
  const b=createPoint(doc,{x:3,y:0});doc=b.document;
  const c=createPoint(doc,{x:4,y:0});doc=c.document;
  const d=createPoint(doc,{x:7,y:0});doc=d.document;
  const c1=createShape(doc,"circle",a.id,b.id);doc=c1.document;
  const c2=createShape(doc,"circle",c.id,d.id);doc=c2.document;
  const xs=createIntersections(doc,c1.id,c2.id);doc=xs.document;
  expect(xs.ids).toHaveLength(2);
  for(const id of xs.ids){
    const p=pointOf(doc,id);
    expect(Math.hypot(p.x,p.y)).toBeCloseTo(3);
    expect(Math.hypot(p.x-4,p.y)).toBeCloseTo(3);
  }
  doc=movePoint(doc,c.id,{x:6,y:0});
  doc=movePoint(doc,d.id,{x:9,y:0});
  expect(pointOf(doc,xs.ids[0]).x).toBeCloseTo(3);
  expect(pointOf(doc,xs.ids[0]).y).toBeCloseTo(0);
  expect(resolveDocument(doc).find(x=>x.object.id===xs.ids[1])?.point).toBeUndefined();
  doc=movePoint(doc,c.id,{x:9,y:0});
  doc=movePoint(doc,d.id,{x:12,y:0});
  expect(resolveDocument(doc).find(x=>x.object.id===xs.ids[0])?.point).toBeUndefined();
 });
 it("平行、重合和同心圆没有有限唯一交点",()=>{
  let doc=blankDocument(); const ids:string[]=[];
  for(const p of [{x:0,y:0},{x:2,y:0},{x:0,y:2},{x:2,y:2},{x:1,y:0}]){
    const v=createPoint(doc,p);doc=v.document;ids.push(v.id);
  }
  const l1=createShape(doc,"line",ids[0],ids[1]);doc=l1.document;
  const l2=createShape(doc,"line",ids[2],ids[3]);doc=l2.document;
  expect(()=>createIntersections(doc,l1.id,l2.id)).toThrow("无有限交点");
  const l3=createShape(doc,"line",ids[0],ids[4]);doc=l3.document;
  expect(()=>createIntersections(doc,l1.id,l3.id)).toThrow("无有限交点");
  const c1=createShape(doc,"circle",ids[0],ids[1]);doc=c1.document;
  const c2=createShape(doc,"circle",ids[0],ids[4]);doc=c2.document;
  expect(()=>createIntersections(doc,c1.id,c2.id)).toThrow("无有限交点");
 });
 it("线段只在自身范围内参与交点，直线无限延伸",()=>{
  const s=setup();let doc=s.doc;
  doc=movePoint(doc,s.C,{x:7,y:-4});
  doc=movePoint(doc,s.D,{x:7,y:4});
  const a=createShape(doc,"segment",s.A,s.B);doc=a.document;
  const b=createShape(doc,"line",s.C,s.D);doc=b.document;
  expect(()=>createIntersections(doc,a.id,b.id)).toThrow("无有限交点");
  const c=createShape(doc,"line",s.A,s.B);doc=c.document;
  expect(createIntersections(doc,c.id,b.id).ids).toHaveLength(1);
 });
 it("能够以交点为顶点继续构造形状，父点移动触发多层更新",()=>{
  const s=setup(),l=lines(s);let doc=l.doc;
  const meet=createIntersections(doc,l.a,l.b);doc=meet.document;
  const circle=createShape(doc,"circle",meet.ids[0],s.B);doc=circle.document;
  expect(resolveDocument(doc).find(x=>x.object.id===circle.id)?.circle?.radius).toBe(4);
  doc=movePoint(doc,s.C,{x:1,y:-4});doc=movePoint(doc,s.D,{x:1,y:4});
  expect(resolveDocument(doc).find(x=>x.object.id===circle.id)?.circle?.center.x).toBeCloseTo(1);
  expect(resolveDocument(doc).find(x=>x.object.id===circle.id)?.circle?.radius).toBeCloseTo(3);
  const shorter=deleteCascade(doc,s.A);
  expect(shorter.objects.some(x=>x.id===l.a)).toBe(false);
  expect(shorter.objects.some(x=>x.id===meet.ids[0])).toBe(false);
  expect(shorter.objects.some(x=>x.id===circle.id)).toBe(false);
  expect(shorter.objects.some(x=>x.id===l.b)).toBe(true);
 });
 it("禁用重名ID、前向引用、循环和不存在的点",()=>{
  const s=setup();
  const invalid=[
    {version:1,objects:[s.doc.objects[0],s.doc.objects[0]]},
    {version:1,objects:[{id:"g1",label:"l",kind:"line",a:"g2",b:"g3"}]},
    {version:1,objects:[{id:"g1",label:"x",kind:"intersection",first:"g1",second:"g1",solution:0}]},
    {version:1,objects:[{id:"g1",label:"x",kind:"point",x:Infinity,y:2}]},
    {version:1,objects:[{id:"g1",label:"x",kind:"point",x:3,y:2,script:"alert(1)"}]},
    {version:1,objects:[{id:"g1",label:"x",kind:"point",x:50000,y:2}]},
  ];
  invalid.forEach(v=>expect(()=>validateDocument(v)).toThrow());
  expect(()=>createShape(s.doc,"circle",s.A,s.A)).toThrow("请选择两个不同");
  expect(()=>createPoint(s.doc,{x:Infinity,y:1})).toThrow();
  expect(()=>createPoint(s.doc,{x:1001,y:1})).toThrow();
 });
 it("保存与导入版本化 JSON，改名、显示开关、顺序编号",()=>{
  let doc=starterDocument();
  const id=doc.objects[0].id;
  doc=renameObject(doc,id,"A");doc=hideObject(doc,id,true);
  expect(doc.objects[0].label).toBe("A");
  expect(doc.objects[0].hidden).toBe(true);
  const loaded=parseDocumentJSON(JSON.stringify(doc));
  expect(loaded).toEqual(doc);
  expect(nextId(loaded)).toBe("g7");
  expect(()=>parseDocumentJSON('{"version":2,"objects":[]}')).toThrow();
  expect(()=>parseDocumentJSON("{notjson")).toThrow();
  expect(()=>parseDocumentJSON("x".repeat(150001))).toThrow("文件过大");
 });
 it("同一对对象重复或反向求交不会重复创建交点",()=>{
  const s=setup();let doc=s.doc;
  const a=createShape(doc,"line",s.A,s.B);doc=a.document;
  const b=createShape(doc,"circle",s.C,s.D);doc=b.document;
  const first=createIntersections(doc,a.id,b.id);
  expect(first.ids).toHaveLength(2);
  expect(createIntersections(first.document,a.id,b.id).ids).toHaveLength(0);
  expect(createIntersections(first.document,b.id,a.id).ids).toHaveLength(0);
  expect(first.document.objects).toHaveLength(doc.objects.length+2);
 });
 it("切线-圆和两圆外切分别只有一个解，极接近切线也不产生伪双交点",()=>{
  let doc=blankDocument();const ids:string[]=[];
  for(const p of [{x:-5,y:3},{x:5,y:3},{x:0,y:0},{x:3,y:0},{x:6,y:0},{x:9,y:0}]){
   const q=createPoint(doc,p);doc=q.document;ids.push(q.id);
  }
  const line=createShape(doc,"line",ids[0],ids[1]);doc=line.document;
  const circle=createShape(doc,"circle",ids[2],ids[3]);doc=circle.document;
  expect(createIntersections(doc,line.id,circle.id).ids).toHaveLength(1);
  const circle2=createShape(doc,"circle",ids[4],ids[5]);doc=circle2.document;
  expect(createIntersections(doc,circle.id,circle2.id).ids).toHaveLength(1);
 });

});
