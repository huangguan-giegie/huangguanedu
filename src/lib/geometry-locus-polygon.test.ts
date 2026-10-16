import {describe,expect,it} from "vitest";
import {
 blankDocument,createPoint,createShape,createIntersections,createPolygon,createLocus,
 movePoint,resolveDocument,polygonMeasures,validSimplePolygon,deleteCascade,
 validateDocument,parseDocumentJSON,type GeometryDocument,type Point,
} from "./free-geometry";
import {sampleLocus,locusPaths} from "./geometry-locus";
function points(doc:GeometryDocument,coords:Point[]){
 const ids:string[]=[];let working=doc;
 for(const p of coords){const item=createPoint(working,p);working=item.document;ids.push(item.id);}
 return {doc:working,ids};
}
describe("任意多边形及几何轨迹",()=>{
 it("凸多边形、凹多边形可以按任意点顺序定义，计算实际周长和面积",()=>{
  let p=points(blankDocument(),[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:2,y:1},{x:0,y:4}]);
  const created=createPolygon(p.doc,p.ids);p.doc=created.document;
  const resolved=resolveDocument(p.doc).find(v=>v.object.id===created.id);
  expect(resolved?.polygon).toHaveLength(5);
  expect(polygonMeasures(resolved!.polygon!).area).toBeCloseTo(10);
  expect(polygonMeasures(resolved!.polygon!).perimeter).toBeGreaterThan(15);
  expect(validSimplePolygon(resolved!.polygon!)).toBe(true);
  expect(parseDocumentJSON(JSON.stringify(p.doc))).toEqual(p.doc);
 });
 it("自交、面积为零以及重复顶点均被拒绝",()=>{
  const bow=points(blankDocument(),[{x:0,y:0},{x:3,y:3},{x:0,y:3},{x:3,y:0}]);
  expect(()=>createPolygon(bow.doc,bow.ids)).toThrow("非自交");
  const linear=points(blankDocument(),[{x:0,y:0},{x:1,y:0},{x:3,y:0}]);
  expect(()=>createPolygon(linear.doc,linear.ids)).toThrow("非自交");
  expect(()=>createPolygon(bow.doc,[bow.ids[0],bow.ids[1],bow.ids[0]])).toThrow("不同顶点");
  expect(()=>createPolygon(bow.doc,[bow.ids[0],bow.ids[1]])).toThrow("3–30");
 });
 it("父点移动令多边形面积改变，自交退化时不产生伪几何",()=>{
  const initial=points(blankDocument(),[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]);
  const {document,id}=createPolygon(initial.doc,initial.ids);
  expect(polygonMeasures(resolveDocument(document).find(o=>o.object.id===id)!.polygon!).area).toBe(4);
  const moved=movePoint(document,initial.ids[2],{x:4,y:2});
  expect(polygonMeasures(resolveDocument(moved).find(o=>o.object.id===id)!.polygon!).area).toBe(6);
  const invalid=movePoint(document,initial.ids[2],{x:0,y:0});
  expect(resolveDocument(invalid).find(o=>o.object.id===id)?.polygon).toBeUndefined();
  expect(deleteCascade(document,initial.ids[0]).objects.some(o=>o.id===id)).toBe(false);
 });
 it("驱动点沿圆运动，依赖交点生成可重算的轨迹（非鼠标残影）",()=>{
  let p=points(blankDocument(),[
   {x:0,y:0}, // path circle center
   {x:3,y:0}, // path circle through
   {x:1,y:1}, // free driver
   {x:1,y:0}, // second point defining dependent line
   {x:-5,y:0}, // fixed horizontal line A
   {x:5,y:0}, // fixed horizontal line B
  ]);
  let doc=p.doc;
  const path=createShape(doc,"circle",p.ids[0],p.ids[1]);doc=path.document;
  // driver moves along path. Dependent line through driver and fixed origin;
  // vertical/horizontal intersections with x-axis may not always be defined
  // but deterministic sample remains finite where defined.
  const other=createShape(doc,"line",p.ids[2],p.ids[3]);doc=other.document;
  const fixed=createShape(doc,"line",p.ids[4],p.ids[5]);doc=fixed.document;
  const intersection=createIntersections(doc,other.id,fixed.id);doc=intersection.document;
  const locus=createLocus(doc,p.ids[2],path.id,intersection.ids[0],72);doc=locus.document;
  const geometry=sampleLocus(doc,locus.document.objects.at(-1) as Extract<typeof doc.objects[number],{kind:"locus"}>);
  expect(geometry).toHaveLength(73);
  expect(geometry.filter(Boolean).length).toBeGreaterThan(5);
  const paths=locusPaths(geometry,p=>({x:300+p.x*20,y:200-p.y*20}));
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.every(d=>!d.includes("NaN")&&!d.includes("Infinity"))).toBe(true);
  const moved=movePoint(doc,p.ids[1],{x:5,y:0});
  const after=sampleLocus(moved,locus.document.objects.at(-1) as Extract<typeof doc.objects[number],{kind:"locus"}>);
  expect(after).toHaveLength(73);
  expect(JSON.stringify(after)).not.toEqual(JSON.stringify(geometry));
 });
 it("非法轨迹不允许自依赖路径或无关目标点",()=>{
  const p=points(blankDocument(),[{x:0,y:0},{x:3,y:0},{x:1,y:1},{x:0,y:3}]);
  let doc=p.doc;
  const circle=createShape(doc,"circle",p.ids[0],p.ids[1]);doc=circle.document;
  const other=createShape(doc,"line",p.ids[2],p.ids[3]);doc=other.document;
  expect(()=>createLocus(doc,p.ids[2],circle.id,p.ids[3])).toThrow("必须依赖驱动点");
  expect(()=>createLocus(doc,p.ids[2],other.id,p.ids[2])).toThrow("路径不能依赖自身");
  expect(()=>validateDocument({version:1,objects:[
   ...doc.objects,{id:"g100",label:"bad",kind:"locus",driver:circle.id,path:circle.id,target:p.ids[2],samples:96}
  ]})).toThrow();
 });
});
