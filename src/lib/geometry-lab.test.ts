import { describe, expect, it } from "vitest";
import {
  LAB_DEFAULTS, SCENE, bisectorLabGeometry, similarityLabGeometry,
  tangentLabGeometry, normalizeBisector, normalizeSimilarity, normalizeTangent,
  dragBisector, dragSimilarity, dragTangent,
  projectBisector, projectSimilarity, projectTangent,
  worldBisector, worldSimilarity, worldTangent, displayMeasure,
} from "./geometry-lab";
import {
  distance, dot, near, subtract, verifyBisector,
  verifySimilarity, verifyExternalTangent,
} from "./practice-construction-constraints";

describe("动态几何实验室：拖动点不会破坏几何约束",()=>{
  it("角平分线移动顶点，BD/DC 始终等于 AB/AC",()=>{
    for(const x of [1.25,2,4.3,7,10.75])for(const y of [1.75,3,5.4,7.75]){
      const state=normalizeBisector({x,y});
      const g=bisectorLabGeometry(state);
      expect(()=>verifyBisector(g)).not.toThrow();
      expect(near(distance(g.B,g.D)/distance(g.D,g.C),g.AB/g.AC)).toBe(true);
      expect(distance(g.B,g.C)).toBe(SCENE.bisector.base);
      const screen=projectBisector(g.A);
      expect(worldBisector(screen).x).toBeCloseTo(x,9);
      expect(worldBisector(screen).y).toBeCloseTo(y,9);
    }
  });
  it("角平分线拖动处理画布之外的坐标和非法数值",()=>{
    const s=dragBisector(LAB_DEFAULTS.bisector,"A",{x:-10000,y:10000});
    expect(s).toEqual({x:1.25,y:1.75});
    expect(()=>bisectorLabGeometry(s)).not.toThrow();
    expect(dragBisector(s,"E",{x:10,y:10})).toEqual(s);
    expect(normalizeBisector({x:Infinity,y:NaN})).toEqual({x:1.25,y:1.75});
  });
  it("相似三角形无论拖动哪些控制点都保持两个直角和三边同一倍率",()=>{
    for(const base of [2,3.5,4,7])for(const height of [2,4.6,7])for(const factor of [1.2,1.85,2.4]){
      const g=similarityLabGeometry({base,height,factor});
      expect(()=>verifySimilarity(g)).not.toThrow();
      expect(distance(g.large.D,g.large.E)/distance(g.small.A,g.small.B)).toBeCloseTo(factor);
      expect(distance(g.large.D,g.large.F)/distance(g.small.A,g.small.C)).toBeCloseTo(factor);
      for(const p of [g.small.A,g.small.B,g.small.C]){
        const screen=projectSimilarity(p);
        const back=worldSimilarity(screen);
        expect(back.x).toBeCloseTo(p.x,8);
        expect(back.y).toBeCloseTo(p.y,8);
      }
      for(const p of [g.large.D,g.large.E,g.large.F]){
        const screen=projectSimilarity(p,true);
        const back=worldSimilarity(screen,true);
        expect(back.x).toBeCloseTo(p.x,8);
        expect(back.y).toBeCloseTo(p.y,8);
      }
    }
  });
  it("相似三角形 B/C/E 的不同拖动行为都修改对应的唯一参数",()=>{
    const s=LAB_DEFAULTS.similarity;
    const b=dragSimilarity(s,"B",projectSimilarity({x:6,y:0}));
    expect(b).toEqual({...s,base:6});
    const c=dragSimilarity(s,"C",projectSimilarity({x:0,y:6.5}));
    expect(c).toEqual({...s,height:6.5});
    const e=dragSimilarity(s,"E",projectSimilarity({x:s.base*1.7,y:0},true));
    expect(e).toEqual({...s,factor:1.7});
    for(const next of [b,c,e]){
      expect(()=>verifySimilarity(similarityLabGeometry(next))).not.toThrow();
    }
    expect(dragSimilarity(s,"R",{x:500,y:0})).toEqual(s);
    expect(normalizeSimilarity({base:-999,height:999,factor:Infinity})).toEqual({base:2,height:7,factor:1.2});
  });
  it("两个圆的半径、圆心距任何可拖动状态下都保持共同切线相切",()=>{
    for(const R of [3,4.3,5,7])for(const r of [1,1.7,3.3,6])
      for(const d of [7,11,14,17]){
        const state=normalizeTangent({R,r,d});
        const g=tangentLabGeometry(state);
        expect(()=>verifyExternalTangent(g)).not.toThrow();
        expect(distance(g.O1,g.O2)).toBeCloseTo(state.d,9);
        expect(near(dot(subtract(g.A,g.O1),subtract(g.B,g.A)),0)).toBe(true);
        expect(near(dot(subtract(g.B,g.O2),subtract(g.B,g.A)),0)).toBe(true);
        expect(distance(g.A,g.B)**2).toBeCloseTo(state.d**2-(state.R-state.r)**2,7);
        for(const p of [g.O1,g.O2,g.A,g.B]){
          const back=worldTangent(projectTangent(p));
          expect(back.x).toBeCloseTo(p.x,8);
          expect(back.y).toBeCloseTo(p.y,8);
        }
      }
  });
  it("向圆内部或画布之外拖动时投影到有效域，没有相交双圆和 NaN",()=>{
    const initial=LAB_DEFAULTS.tangent;
    const tooClose=dragTangent(initial,"O2",projectTangent({x:1,y:0}));
    expect(tooClose.d).toBeGreaterThanOrEqual(tooClose.R+tooClose.r+0.4-1e-7);
    const large=dragTangent(initial,"R",projectTangent({x:0,y:99}));
    expect(large.R).toBe(7);
    const small=dragTangent(initial,"r",projectTangent({x:0,y:-8}));
    expect(small.r).toBe(1);
    for(const s of [tooClose,large,small]){
      expect(()=>verifyExternalTangent(tangentLabGeometry(s))).not.toThrow();
    }
    expect(dragTangent(initial,"A",{x:20,y:20})).toEqual(initial);
    expect(normalizeTangent({R:NaN,r:Infinity,d:-100})).toEqual({R:3,r:1,d:4.4});
  });
  it("小数格式稳定，避免 floating-point 长尾数字显示",()=>{
    expect(displayMeasure(3)).toBe("3");
    expect(displayMeasure(3.1)).toBe("3.1");
    expect(displayMeasure(3.125)).toBe("3.13");
    expect(displayMeasure(0)).toBe("0");
    expect(displayMeasure(1.999999999)).toBe("2");
  });
});
