import {describe,expect,it} from "vitest";
import {analyzeJilin,analyzeGaokao,classifyJilinInterior} from "./verified-exam-casebook";

const jilin={knownX:2,knownY:-1,ratio:2,movingX:-.5};
const gaokao={majorSquared:12,minorSquared:9,pointAngle:30,area:9};

describe("2025 吉林中考第22题：真正的连续四问",()=>{
  it("原始已知点 T(2,-1) 唯一得到 b=-2 和顶点 (1,-2)",()=>{
    const q=analyzeJilin(jilin);
    expect(q.coefficient).toBe(-2);
    expect(q.vertex).toEqual({x:1,y:-2});
    expect(q.parts).toHaveLength(4);
    expect(q.parts[0].answer).toContain("b=-2");
  });
  it("原题反向延长λ=2，y轴两侧面积比恒为4:5（非退化）",()=>{
    for(const m of [-3,-2,-1,-.7,-.5,.8,1.8,3]){
      const q=analyzeJilin({...jilin,movingX:m});
      expect(q.validTriangle).toBe(true);
      expect(q.areaRatio).toBe("4 : 5");
      const P=q.point,Q=q.other,M=q.corner;
      expect(Q.x).toBeCloseTo(-2*P.x);
      expect(Q.y).toBeCloseTo(-2*P.y);
      expect(M.x).toBeCloseTo(P.x);
      expect(M.y).toBeCloseTo(Q.y);
      const large=Math.abs((P.x-Q.x)*(P.y-M.y))/2;
      const smallerSide=large*4/9;
      expect(smallerSide/large).toBeCloseTo(4/9);
    }
  });
  it("有限边MQ穿过抛物线顶点时有两个不同的Q位置",()=>{
    const q=analyzeJilin(jilin);
    expect(q.criticalPoints).toHaveLength(2);
    const expected=[-2*(1+Math.sqrt(3)),-2*(1-Math.sqrt(3))].sort((a,b)=>a-b);
    expect(q.criticalPoints.map(p=>p.x).sort((a,b)=>a-b)).toEqual(expected);
    for(const Q of q.criticalPoints)expect(Q.y).toBeCloseTo(-2,10);
    expect(q.parts[2].answer).toContain("√3");
  });
  it("动点m跨越临界值出现多个单调区间；只认证当前m",()=>{
    expect(classifyJilinInterior(-2,2,-1.2).descending).toBe(true);
    expect(classifyJilinInterior(-2,2,-.8).descending).toBe(false);
    expect(classifyJilinInterior(-2,2,-.5).descending).toBe(true);
    expect(classifyJilinInterior(-2,2,.5).descending).toBeNull();
    expect(classifyJilinInterior(-2,2,1).descending).toBe(true);
    expect(classifyJilinInterior(-2,2,3).descending).toBe(false);
    const q=analyzeJilin(jilin);
    expect(q.parts[3].kind).toBe("exploration");
    expect(q.parts[3].proof).toContain("当前 m");
  });
  it("坐标轴退化时面积比不能装作有效的实际三角形",()=>{
    const q=analyzeJilin({...jilin,movingX:0});
    expect(q.validTriangle).toBe(false);
    expect(q.parts[1].answer).toContain("退化");
    expect(q.parts[3].answer).toContain("不适用");
  });
  it("改变已知点与延长比例后，各问数学对象与面积比同步更新",()=>{
    const q=analyzeJilin({...jilin,knownY:1,ratio:3});
    expect(q.coefficient).toBe(-1);
    expect(q.areaRatio).toBe("9 : 7");
    expect(q.other.x).toBeCloseTo(1.5);
  });
});

describe("2024 新高考I卷：真实椭圆解答题的两问递进",()=>{
  it("原题反求椭圆 x²/12+y²/9=1 且离心率为1/2",()=>{
    const q=analyzeGaokao(gaokao);
    expect(q.parts).toHaveLength(2);
    expect(q.isOriginal).toBe(true);
    expect(q.A.x).toBeCloseTo(0,12);
    expect(q.A.y).toBeCloseTo(3,12);
    expect(q.P.x).toBeCloseTo(3,10);
    expect(q.P.y).toBeCloseTo(1.5,10);
    expect(q.eccentricity).toBeCloseTo(.5,12);
    expect(q.parts[0].answer).toContain("e=1/2");
  });
  it("面积9产生两个B交点，恰好得到 y=x/2 与 y=3x/2−3",()=>{
    const q=analyzeGaokao(gaokao);
    expect(q.candidates).toHaveLength(2);
    expect(q.parts[1].answer).toBe("y=x/2；y=3x/2−3");
    const slopes=q.candidates.map(c=>c.slope!).sort((a,b)=>a-b);
    expect(slopes[0]).toBeCloseTo(.5,9);
    expect(slopes[1]).toBeCloseTo(1.5,9);
    for(const c of q.candidates){
      const B=c.point;
      expect(B.x*B.x/12+B.y*B.y/9).toBeCloseTo(1,10);
      const area=Math.abs((q.P.x-q.A.x)*(B.y-q.A.y)-
         (q.P.y-q.A.y)*(B.x-q.A.x))/2;
      expect(area).toBeCloseTo(9,10);
    }
  });
  it("面积条件调整可导致4/2/0候选点，多解不可漏掉",()=>{
    expect(analyzeGaokao({...gaokao,area:.5}).candidates).toHaveLength(4);
    expect(analyzeGaokao({...gaokao,area:1}).candidates).toHaveLength(2);
    expect(analyzeGaokao({...gaokao,area:25}).candidates).toHaveLength(0);
  });
  it("其他椭圆参数仍严格验证候选B点与面积，不强行声称为原卷",()=>{
    const vari=analyzeGaokao({majorSquared:25,minorSquared:16,pointAngle:45,area:3});
    expect(vari.isOriginal).toBe(false);
    for(const candidate of vari.candidates){
      const B=candidate.point;
      expect(B.x*B.x/25+B.y*B.y/16).toBeCloseTo(1,9);
      const area=Math.abs((vari.P.x-vari.A.x)*(B.y-vari.A.y)-
        (vari.P.y-vari.A.y)*(B.x-vari.A.x))/2;
      expect(area).toBeCloseTo(3,9);
    }
  });
  it("无效或退化椭圆参数必须被拦截",()=>{
    expect(()=>analyzeGaokao({...gaokao,majorSquared:8,minorSquared:9})).toThrow();
    expect(()=>analyzeGaokao({...gaokao,area:0})).toThrow();
    expect(()=>analyzeGaokao({...gaokao,pointAngle:90})).toThrow();
  });
});
