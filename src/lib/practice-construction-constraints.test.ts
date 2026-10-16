import { describe, expect, it } from "vitest";
import { compileDiagramProblem, PracticeDiagramSchema } from "./practice-diagram";
import {
  constructBisector, constructSimilarity, constructExternalTangent,
  verifyBisector, verifySimilarity, verifyExternalTangent, distance,
  dot, subtract, near,
} from "./practice-construction-constraints";

describe("可验证几何构造（受约束的数值关系）", () => {
  it("每种角平分线均满足边长、角度、角平分线定理", () => {
    for(const sides of ["6-8-7","6-9-10","8-12-10","9-12-7","10-15-15"] as const) {
      const [AB,AC,BC]=sides.split("-").map(Number);
      const g=constructBisector(AB,AC,BC);
      expect(() => verifyBisector(g)).not.toThrow();
      expect(near(distance(g.B,g.D)*AC, distance(g.D,g.C)*AB)).toBe(true);
      const q=compileDiagramProblem({type:"triangle_angle_bisector",sides});
      expect(q.answer).toBe(`${Math.round(BC*AB/(AB+AC))} cm`);
      expect(q.question).toContain(`BC＝${BC} cm`);
      expect(q.question).toContain("AD平分∠BAC");
      expect(q.explanation).toContain("角平分线定理");
      expect(PracticeDiagramSchema.safeParse(q.diagram).success).toBe(true);
    }
  });
  it("篡改任意构造点后角平分线检查立即失败", () => {
    const g=constructBisector(6,9,10);
    expect(()=>verifyBisector({...g,D:{...g.D,x:g.D.x+0.45}})).toThrow("几何约束校验失败");
    expect(()=>verifyBisector({...g,A:{...g.A,y:g.A.y-0.3}})).toThrow("几何约束校验失败");
    expect(()=>constructBisector(1,2,10)).toThrow("不能组成三角形");
  });

  it("相似三角形所有允许比例保留两个直角与三边比例", () => {
    for(const smallLegs of ["3-4","4-5","5-7","6-8"] as const)
      for(const factor of [2,3] as const)
        for(const task of ["LARGE_BASE","LARGE_HEIGHT"] as const){
          const [b,h]=smallLegs.split("-").map(Number);
          const g=constructSimilarity(b,h,factor);
          expect(()=>verifySimilarity(g)).not.toThrow();
          expect(distance(g.large.D,g.large.E)/distance(g.small.A,g.small.B)).toBeCloseTo(factor);
          expect(distance(g.large.D,g.large.F)/distance(g.small.A,g.small.C)).toBeCloseTo(factor);
          const q=compileDiagramProblem({type:"similar_right_triangles",smallLegs,factor,task});
          expect(q.answer).toBe(`${(task==="LARGE_BASE"?b:h)*factor} cm`);
          expect(q.question).toContain("△ABC∽△DEF");
          expect(q.question).toContain("∠A＝∠D＝90°");
          expect(q.question).toContain(`AB＝${b} cm`);
        }
  });
  it("伪相似与点位翻转会触发几何约束错误", () => {
    const g=constructSimilarity(3,4,2);
    expect(()=>verifySimilarity({...g,large:{...g.large,E:{x:6.4,y:0}}})).toThrow("几何约束校验失败");
    expect(()=>verifySimilarity({...g,large:{...g.large,F:{x:0,y:-8}}})).toThrow("几何约束校验失败");
  });

  it("两圆公切线构造满足双圆外离、半径垂直和长度公式", () => {
    for(const circles of ["4-1-5","7-2-13","10-2-17"] as const){
      const [R,r,d]=circles.split("-").map(Number);
      const g=constructExternalTangent(R,r,d);
      expect(()=>verifyExternalTangent(g)).not.toThrow();
      expect(d).toBeGreaterThanOrEqual(R+r);
      expect(near(dot(subtract(g.A,g.O1),subtract(g.B,g.A)),0)).toBe(true);
      expect(near(dot(subtract(g.B,g.O2),subtract(g.B,g.A)),0)).toBe(true);
      const L=Math.sqrt(d*d-(R-r)**2);
      expect(distance(g.A,g.B)).toBeCloseTo(L,8);
      const q=compileDiagramProblem({type:"two_circles_external_tangent",circles});
      expect(q.answer).toBe(`${L} cm`);
      expect(q.question).toContain(`O₁O₂＝${d} cm`);
      expect(q.question).toContain("公切线段");
      expect(q.explanation).toContain("AB²");
    }
  });
  it("切点偏移或相交两圆会触发约束错误", () => {
    const g=constructExternalTangent(7,2,13);
    expect(()=>verifyExternalTangent({...g,B:{x:g.B.x+0.2,y:g.B.y}})).toThrow("几何约束校验失败");
    expect(()=>constructExternalTangent(5,2,5)).toThrow("两圆外公切线条件不成立");
  });

  it("无效枚举和自由文本坐标都不能进入数据库", () => {
    for(const proposed of [
      {type:"triangle_angle_bisector",sides:"3-4-100"},
      {type:"similar_right_triangles",smallLegs:"5-5",factor:2,task:"LARGE_BASE"},
      {type:"similar_right_triangles",smallLegs:"3-4",factor:0,task:"LARGE_BASE"},
      {type:"two_circles_external_tangent",circles:"5-2-5"},
      {type:"two_circles_external_tangent",circles:"7-2-13",svg:"<script/>",points:[{x:9999,y:9999}]},
    ]) {
      if(proposed.type==="two_circles_external_tangent" && "svg" in proposed) {
        // Zod object strips unknown keys; it never forwards arbitrary SVG.
        const parsed=PracticeDiagramSchema.parse(proposed);
        expect(Object.hasOwn(parsed,"svg")).toBe(false);
        expect(Object.hasOwn(parsed,"points")).toBe(false);
      }else {
        expect(PracticeDiagramSchema.safeParse(proposed).success).toBe(false);
      }
    }
  });
});
