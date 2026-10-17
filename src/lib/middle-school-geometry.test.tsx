import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {diameterCyclicQuadrilateral,geometryLabSnapshot,middleSchoolTheorems,presetGeometry} from "./middle-school-geometry";
import {diagramAngleClaimViolations,diameterClaimViolations} from "./diagram-renderer/layout-engine";
import {matchingLegacyDiameterProblem} from "./legacy-circle-repair";
import {compileDiagramProblem} from "./practice-diagram";
import {packPracticeDrawing,unpackPracticeDrawing,geometryDraftExport,geometryDraftImport} from "./practice-drawing";
import {geometryMeasurements} from "./geometry-cas-bridge";
import {AttachedGeometryFigure} from "../components/AttachedGeometryFigure";
import {DiameterCyclicPracticeDiagram} from "../components/DiameterCyclicPracticeDiagram";
import {resolveDocument,validateDocument} from "./free-geometry";
describe("截图中圆内接四边形的严格数学关系",()=>{
 it.each([110,120,125,130,140])("∠ADC=%i°，图形实际角度匹配，BAC=ADC−90",adc=>{
  const g=diameterCyclicQuadrilateral(adc);
  expect(g.angleADC).toBeCloseTo(adc,8);
  expect(g.angleBAC).toBeCloseTo(adc-90,8);
  expect(g.angleACB).toBeCloseTo(90,8);
  expect(g.arcOrder).toEqual(["A","D","C","B"]);
  const projected=new Map(Object.entries({A:g.A,B:g.B,C:g.C,D:g.D,O:g.O}));
  expect(diagramAngleClaimViolations(`∠ADC＝${adc}°`,projected)).toEqual([]);
  const q=compileDiagramProblem({type:"circle_diameter_quadrilateral",angleADC:adc as 110|120|125|130|140});
  expect(q.answer).toBe(`${adc-90}°`);
  expect(q.question).toContain(`∠ADC＝${adc}°`);
 });
 it("截图错误点顺序 A-C-D-B 被判为不满足 125°，拒绝生成虚假图",()=>{
  const bad=diameterCyclicQuadrilateral(125);
  const wrongMap=new Map(Object.entries({A:bad.A,B:bad.B,C:bad.D,D:bad.C,O:bad.O}));
  const issues=diagramAngleClaimViolations("AB是直径，∠ADC＝125°，求∠BAC",wrongMap);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0]).toContain("实际绘制");
 });
 it("旧版截图题干严格匹配，能识别且不会误修其他几何题",()=>{
  const q="如图，四边形 ABCD 内接于 ⊙O，AB 是 ⊙O 的直径，∠ADC = 125°。求∠BAC 的度数。";
  const canonical=matchingLegacyDiameterProblem(q);
  expect(canonical?.answer).toBe("35°");
  expect(canonical?.diagram.type).toBe("circle_diameter_quadrilateral");
  expect(matchingLegacyDiameterProblem("△ABC中 AB 为直径，∠ADC = 125° 求∠BAC")).toBeNull();
  expect(matchingLegacyDiameterProblem("四边形ABCD内接于圆O，AB是直径，∠ADC=73° 求∠BAC")).toBeNull();
 });
 it("声称 AB 是直径但两端非对径，应在模型渲染前拒绝",()=>{
  const vertices=new Map(Object.entries({
   A:{x:-5,y:0},B:{x:4,y:-1},O:{x:0,y:0}
  }));
  const desc={shapeType:"circle" as const,vertices:[{label:"A"},{label:"B"},{label:"O"}],circles:[{center:"O",radiusPoint:"A"}]};
  expect(diameterClaimViolations("AB是⊙O的直径",desc,vertices).length).toBe(1);
  vertices.set("B",{x:5,y:0});
  expect(diameterClaimViolations("AB是⊙O的直径",desc,vertices)).toEqual([]);
 });
 it("数学校验拒绝退化和非法角，服务器生成的图可安全 SSR",()=>{
  expect(()=>diameterCyclicQuadrilateral(90)).toThrow();
  expect(()=>diameterCyclicQuadrilateral(180)).toThrow();
  const markup=renderToStaticMarkup(createElement(DiameterCyclicPracticeDiagram,{angleADC:125}));
  expect(markup).toContain("125°");
  expect(markup).toContain("viewBox");
  expect(markup).not.toMatch(/NaN|Infinity/);
 });
});
describe("绘图在三种数学工具之间可复用",()=>{
 it("20 个初中定理及 9 种可编辑模板",()=>{
  expect(middleSchoolTheorems.length).toBeGreaterThanOrEqual(18);
  for(const key of ["diameter","bisector","similar","tangent","pythagoras","midline","isosceles","parallel","polygon"]){
   const doc=presetGeometry(key);
   expect(validateDocument(doc)).toEqual(doc);
   expect(resolveDocument(doc).some(r=>r.line||r.circle||r.polygon)).toBe(true);
  }
 });
 it("动态实验室导出的是实际拖拽后的点和圆而非默认状态",()=>{
  const a=geometryLabSnapshot("bisector",{bis:{x:3,y:5}});
  const b=geometryLabSnapshot("bisector",{bis:{x:7,y:6}});
  expect(a.objects).not.toEqual(b.objects);
  expect(geometryDraftImport(geometryDraftExport(a))).toEqual(a);
  const measure=geometryMeasurements(a);
  expect(measure.length).toBeGreaterThanOrEqual(3);
 });
 it("自定义图形附加保留原题已验证 diagram，不覆盖题干、答案或评分",()=>{
  const orig={type:"rectangle" as const,width:6,height:4,task:"AREA" as const};
  const doc=geometryLabSnapshot("diameter");
  const packed=packPracticeDrawing(orig,doc);
  const first=unpackPracticeDrawing(packed);
  expect(first.original).toEqual(orig);
  expect(first.drawing).toEqual(doc);
  const repacked=packPracticeDrawing(packed,geometryLabSnapshot("tangent"));
  expect(unpackPracticeDrawing(repacked).original).toEqual(orig);
  expect(unpackPracticeDrawing(repacked).drawing).not.toEqual(doc);
  const markup=renderToStaticMarkup(createElement(AttachedGeometryFigure,{document:doc}));
  expect(markup).toContain("<svg");
  expect(markup).not.toContain("<script");
 });
});
