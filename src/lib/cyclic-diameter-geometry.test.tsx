import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {cyclicDiameterGeometry,angleAt,detectLegacyCyclicDiameterQuestion} from "./cyclic-diameter-geometry";
import {compileDiagramProblem} from "./practice-diagram";
import {CyclicDiameterDiagram} from "../components/CyclicDiameterDiagram";
import {GeometrySnapshot} from "../components/GeometrySnapshot";
import {exportGeometryLabModel} from "./geometry-lab-export";
import {validateDocument,resolveDocument} from "./free-geometry";

describe("圆内接四边形不允许AI题图违背题设",()=>{
 for(const obtuseAngle of [110,120,125,130,140] as const){
  it(`构造的真实∠ADC为${obtuseAngle}°，圆直径直角成立`,()=>{
   const g=cyclicDiameterGeometry(obtuseAngle);
   expect(angleAt(g.A,g.D,g.C)).toBeCloseTo(obtuseAngle,8);
   expect(angleAt(g.A,g.C,g.B)).toBeCloseTo(90,8);
   expect(angleAt(g.B,g.A,g.C)).toBeCloseTo(obtuseAngle-90,8);
   for(const label of ["A","B","C","D"] as const)
    expect(Math.hypot(g[label].x,g[label].y)).toBeCloseTo(g.radius,8);
   const compiled=compileDiagramProblem({type:"cyclic_diameter_quadrilateral",obtuseAngle});
   expect(compiled.question).toContain(`∠ADC＝${obtuseAngle}°`);
   expect(compiled.answer).toBe(`${obtuseAngle-90}°`);
   expect(renderToStaticMarkup(createElement(CyclicDiameterDiagram,{obtuseAngle}))).toContain(`${obtuseAngle}°`);
  });
 }
 it("识别截图中的旧版模型生成错误题图，不误改无关题目",()=>{
  const text="如图，四边形 ABCD 内接于⊙O，AB 是⊙O的直径，∠ADC = 125°。求∠BAC的度数。";
  expect(detectLegacyCyclicDiameterQuestion(text)).toBe(125);
  expect(detectLegacyCyclicDiameterQuestion("在△ABC中，∠ADC=125°，求∠BAC")).toBe(null);
  expect(detectLegacyCyclicDiameterQuestion("圆内接四边形ABCD，AB是直径，∠ADC=80°，求∠BAC")).toBe(null);
 });
 it("实验室作品可成为符合schema的可打印静态附图",()=>{
  for(const model of [
   {mode:"bisector" as const,state:{x:4,y:6}},
   {mode:"similarity" as const,state:{base:4,height:5,factor:2}},
   {mode:"tangent" as const,state:{R:5,r:2,d:12}},
   {mode:"cyclic" as const,angle:125},
  ]){
   const doc=exportGeometryLabModel(model);
   expect(()=>validateDocument(doc)).not.toThrow();
   expect(resolveDocument(doc).some(p=>Boolean(p.circle||p.line))).toBe(true);
   const html=renderToStaticMarkup(createElement(GeometrySnapshot,{document:doc}));
   expect(html).toContain("<svg");
   expect(html).not.toMatch(/NaN|Infinity|<script/);
  }
 });
});
