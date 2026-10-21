import {describe,expect,it,vi} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {cameraProject,build3DLines,plotToSvgPath,worldAxes,DEFAULT_CAMERA,type SurfaceKind} from "./geometry-3d";
import {MathStudio} from "../components/MathStudio";
import {FreeGeometryEditor} from "../components/FreeGeometryEditor";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
describe("三维几何投影与符号工作室",()=>{
 it("六种三维参数图所有点坐标有界且有限",()=>{
  for(const kind of ["plane","paraboloid","saddle","sphere","torus","helix"] as SurfaceKind[]){
   for(const amplitude of [-2,-.5,0,1,2]){
    const lines=build3DLines({kind,amplitude});
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThan(60);
    expect(lines.flat().length).toBeLessThan(3500);
    for(const p of lines.flat()){
     expect(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)).toBe(true);
     expect(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))).toBeLessThan(22);
    }
    const svg=plotToSvgPath(lines[0],DEFAULT_CAMERA);
    expect(svg).toMatch(/^M/);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
   }
  }
 });
 it("球面、环面采样点符合原始三维方程",()=>{
  for(const p of build3DLines({kind:"sphere",amplitude:2}).flat())
   expect(p.x*p.x+p.y*p.y+p.z*p.z).toBeCloseTo(9,7);
  for(const p of build3DLines({kind:"torus",amplitude:1}).flat()){
   const r=Math.hypot(p.x,p.y);
   expect((r-2)**2+p.z*p.z).toBeCloseTo(.8**2,7);
  }
 });
 it("相机旋转不改变三维模型，投影保持有限且轴可见",()=>{
  expect(worldAxes()).toHaveLength(3);
  for(const azimuth of [0,45,90,180,270,360])
   for(const elevation of [-80,-30,0,40,80]){
    const point=cameraProject({x:2,y:-3,z:1},{azimuth,elevation,scale:45});
    expect(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.depth)).toBe(true);
   }
 });
 it("CAS与自由作图编辑器均可 SSR，包含完整功能入口",()=>{
  const cas=renderToStaticMarkup(createElement(MathStudio,{view:"cas"}));
  expect(cas).toContain("符号代数 CAS");
  expect(cas).toContain("圆锥曲线");
  const functions=renderToStaticMarkup(createElement(MathStudio));
  expect(functions).toContain("函数图像 · 中高考考点");
  expect(functions).toContain("绘制函数图像");
  expect(cas).toContain("因式分解");
  expect(cas).not.toContain("<script");
  const editor=renderToStaticMarkup(createElement(FreeGeometryEditor));
  expect(editor).toContain("多边形");
  expect(editor).toContain("轨迹");
  expect(editor).toContain("圆");
  expect(editor).not.toMatch(/NaN|Infinity/);
 });
});
