import {describe,expect,it} from "vitest";
import {analyzeSquare} from "./verified-exam-casebook";

describe("2025 吉林中考第19题：运动正方形 + 相似 + 分段面积",()=>{
  it("原题对应 A(0,0),B(3,3),C(7,0),AB=3√2,BC=5,AC=7",()=>{
    const m=analyzeSquare({leg:3,base:7,movement:4});
    expect(m.A).toEqual({x:0,y:0});
    expect(m.B).toEqual({x:3,y:3});
    expect(m.C).toEqual({x:7,y:0});
    expect(Math.hypot(m.B.x,m.B.y)).toBeCloseTo(3*Math.SQRT2,12);
    expect(m.bc).toBe(5);
    expect(m.ac).toBe(7);
    expect(m.parts).toHaveLength(3);
    expect(m.parts[0].answer).toBe("AC=7");
    expect(m.parts[2].answer).toBe("AP=6");
  });
  it("t≤3的重叠为直角三角形，面积t²/2",()=>{
    for(const x of [.5,1,2,2.5,3]){
      const m=analyzeSquare({leg:3,base:7,movement:x});
      expect(m.area).toBeCloseTo(x*x/2,11);
      expect(m.intersection).toHaveLength(3);
    }
  });
  it("t>3面积等于全三角形减右侧相似小三角形",()=>{
    for(const x of [3.5,4,5,6,7]){
      const m=analyzeSquare({leg:3,base:7,movement:x});
      expect(m.area).toBeCloseTo(10.5-3*(7-x)**2/8,10);
      expect(m.intersection).toHaveLength(4);
    }
    expect(analyzeSquare({leg:3,base:7,movement:4}).area).toBeCloseTo(7.125,11);
  });
  it("分段t=3处严格连续，中心t=6处是可行唯一解",()=>{
    const left=analyzeSquare({leg:3,base:7,movement:3});
    const right=analyzeSquare({leg:3,base:7,movement:3.00001});
    expect(left.area).toBe(4.5);
    expect(right.area).toBeCloseTo(4.5+3*.00001,4);
    const fixed=analyzeSquare({leg:3,base:7,movement:6});
    expect((fixed.A.x+fixed.D.x)/2).toBe(fixed.B.x);
    expect((fixed.A.y+fixed.D.y)/2).toBe(fixed.B.y);
  });
  it("不同有效d,L组合均满足相似比例及面积连续，避免只对原题硬编码",()=>{
    for(const d of [2,3,4,5]){
      for(const L of [2*d+1,2*d+2]){
        const left=analyzeSquare({leg:d,base:L,movement:d});
        const right=analyzeSquare({leg:d,base:L,movement:d+.000001});
        expect(left.area).toBeCloseTo(d*d/2,10);
        expect(right.area).toBeCloseTo(left.area,4);
        expect(analyzeSquare({leg:d,base:L,movement:L}).area).toBeCloseTo(d*L/2,10);
        expect(analyzeSquare({leg:d,base:L,movement:2*d}).centerAt).toBe(2*d);
      }
    }
  });
  it("排除几何歧义和非法动点位置",()=>{
    expect(()=>analyzeSquare({leg:3,base:5,movement:3})).toThrow();
    expect(()=>analyzeSquare({leg:3,base:7,movement:8})).toThrow();
    expect(()=>analyzeSquare({leg:0,base:7,movement:3})).toThrow();
  });
});
