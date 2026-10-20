import { describe, expect, it } from "vitest";
import { analyzeSimilarity, analyzeQuadratic, analyzeConic, analyzeLineFamily, intersectGeneralConic } from "./real-exam-models";
import { conicValue, type ConicModel } from "./exam-conics";

const ellipse:ConicModel={kind:"ellipse",a:5,b:3,p:2};
const hyperbola:ConicModel={kind:"hyperbola",a:4,b:2,p:1};
const parabola:ConicModel={kind:"parabola",a:4,b:2,p:1};

describe("中考相似：平行比例与面积的目标定解",()=>{
  const input={base:6,height:8,ad:3,lockD:false,target:"segment" as const};
  it("AD不锁定时，DE长不是定值，拒绝生成假答案",()=>{
    const r=analyzeSimilarity(input);
    expect(r.degreesOfFreedom).toBe(1);
    expect(r.question).toBeNull();
    expect(r.value).toBeNull();
  });
  it("AD=3时小三角形为3-4-5，相似比1/2、面积6、梯形18",()=>{
    const seg=analyzeSimilarity({...input,lockD:true,target:"segment"});
    expect(seg.value).toBe("1/2×10");
    expect(seg.question?.exact).toBe(true);
    expect(seg.points[4]).toEqual({x:0,y:4});
    expect(analyzeSimilarity({...input,lockD:true,target:"area"}).value).toBe("6");
    expect(analyzeSimilarity({...input,lockD:true,target:"trapezoid"}).value).toBe("18");
    expect(analyzeSimilarity({...input,lockD:true,target:"ratio"}).value).toBe("1/2");
  });
  it("动点仍可滑动，DE/AD 恒等于 BC/AB，有独立定值证明",()=>{
    const r=analyzeSimilarity({...input,target:"fixedRatio"});
    expect(r.degreesOfFreedom).toBe(1);
    expect(r.invariant).toBe(true);
    expect(r.question?.explanation).toContain("与动点 D 的位置无关");
    for(const ad of [1,2,3,4,5]){
      expect(analyzeSimilarity({...input,ad,target:"fixedRatio"}).value).toBe("10/6");
    }
  });
  it("端点/退化距离被阻止，不会输出虚假的图",()=>{
    expect(()=>analyzeSimilarity({...input,ad:6})).toThrow();
    expect(()=>analyzeSimilarity({...input,base:0})).toThrow();
  });
});

describe("中考二次函数：两函数交点、韦达与最值",()=>{
  const input={a:1,h:1,v:-4,slope:0,intercept:0,left:-2,right:4,target:"count" as const};
  it("顶点式y=(x-1)^2-4与水平线交于(-1,0)、(3,0)",()=>{
    const r=analyzeQuadratic(input);
    expect(r.discriminant).toBe(16);
    expect(r.roots).toEqual([-1,3]);
    expect(r.value).toBe("2");
    expect(r.points.map(q=>q.y)).toEqual([0,0]);
    expect(analyzeQuadratic({...input,target:"sum"}).value).toBe("2");
    expect(analyzeQuadratic({...input,target:"chord"}).value).toBe("约 4");
  });
  it("零判别式相切只能产生单交点，求两点弦长应拒绝",()=>{
    const r=analyzeQuadratic({...input,v:0});
    expect(r.roots).toEqual([1]);
    expect(r.value).toBe("1");
    const chord=analyzeQuadratic({...input,v:0,target:"chord"});
    expect(chord.question).toBeNull();
    expect(chord.value).toBeNull();
  });
  it("交点不可行时可判交点数为零，但不伪造两根之和",()=>{
    expect(analyzeQuadratic({...input,v:4}).value).toBe("0");
    expect(analyzeQuadratic({...input,v:4,target:"sum"}).question).toBeNull();
  });
  it("开口方向与区间端点、顶点共同决定最大/最小值",()=>{
    const max=analyzeQuadratic({...input,target:"max"});
    const min=analyzeQuadratic({...input,target:"min"});
    expect(max.value).toBe("5");
    expect(min.value).toBe("-4");
    expect(analyzeQuadratic({...input,a:-1,target:"max"}).value).toBe("-4");
    expect(analyzeQuadratic({...input,a:-1,target:"min"}).value).toBe("-13");
    expect(()=>analyzeQuadratic({...input,left:5,right:4})).toThrow();
  });
});

describe("高考解析几何：完整方向参数化 + 韦达",()=>{
  it("椭圆中心两条轴向截线长分别为10、6，实交点都满足曲线",()=>{
    const major=intersectGeneralConic(ellipse,{through:{x:0,y:0},angle:0});
    const minor=intersectGeneralConic(ellipse,{through:{x:0,y:0},angle:90});
    expect(major.status).toBe("secant");
    expect(major.chord).toBeCloseTo(10,10);
    expect(minor.chord).toBeCloseTo(6,10);
    for(const p of [...major.points,...minor.points])expect(conicValue(ellipse,p)).toBeCloseTo(0,9);
  });
  it("椭圆切点有一个交点，外部平行线可以没有实交点",()=>{
    const tangent=intersectGeneralConic(ellipse,{through:{x:0,y:3},angle:0});
    expect(tangent.status).toBe("tangent");
    expect(tangent.points).toHaveLength(1);
    expect(intersectGeneralConic(ellipse,{through:{x:0,y:4},angle:0}).status).toBe("none");
  });
  it("双曲线渐近方向在原点不产生有限交点，不误判为相切",()=>{
    const s=intersectGeneralConic(hyperbola,{through:{x:0,y:0},angle:Math.atan(.5)*180/Math.PI});
    expect(s.status).toBe("none");
  });
  it("抛物线沿轴方向是一次交点但非切线；一般割线保留交点",()=>{
    const axis=intersectGeneralConic(parabola,{through:{x:0,y:0},angle:0});
    expect(axis.status).toBe("linear");
    expect(axis.points).toHaveLength(1);
    const secant=intersectGeneralConic(parabola,{through:{x:2,y:0},angle:90});
    expect(secant.status).toBe("secant");
    for(const pt of secant.points)expect(conicValue(parabola,pt)).toBeCloseTo(0,9);
  });
  it("直线参数根和、弦长等只有在适用实根情形下才可出题",()=>{
    const yes=analyzeConic({curve:ellipse,through:{x:0,y:0},angle:35,target:"rootSum"});
    expect(yes.question?.explanation).toContain("韦达");
    const no=analyzeConic({curve:ellipse,through:{x:0,y:4},angle:0,target:"chord"});
    expect(no.question).toBeNull();
  });
});

describe("高考多条过定点直线：正交倒数积和真定值",()=>{
  const input={curve:ellipse,through:{x:1,y:1},angles:[15,105,80,130],
    perpendicular:true,target:"reciprocal" as const};
  it("椭圆内部点的两条垂直割线的倒数积和与方向角无关",()=>{
    const expected=(1/25+1/9)/(1-1/25-1/9);
    for(const angle of [0,10,15,40,60,90,125,175]){
      const r=analyzeLineFamily({...input,angles:[angle,0]});
      expect(r.certification).toBe(true);
      expect(r.question?.exact).toBe(true);
      expect(r.sections).toHaveLength(2);
      const actual=r.sections.reduce((s,v)=>s+1/Math.abs(v.product!),0);
      expect(actual).toBeCloseTo(expected,8);
      expect(r.question?.explanation).toContain("韦达");
    }
  });
  it("添加第三、四条线不改变前两条线的定值，交点逐条渲染",()=>{
    const r=analyzeLineFamily({...input,angles:[25,0,50,125]});
    expect(r.sections).toHaveLength(4);
    expect(r.points).toHaveLength(8);
    expect(r.certification).toBe(true);
  });
  it("取消互相垂直时不得给出‘定值’证明",()=>{
    const r=analyzeLineFamily({...input,perpendicular:false,angles:[10,60]});
    expect(r.certification).toBe(false);
    expect(r.question?.exact).toBe(false);
    expect(r.notes.join(" ")).toContain("不能把一个数值当作定值证明");
  });
  it("椭圆外点或其他圆锥曲线禁止套用椭圆正交恒等式",()=>{
    const outside=analyzeLineFamily({...input,through:{x:6,y:0}});
    expect(outside.certification).toBe(false);
    expect(analyzeLineFamily({...input,curve:hyperbola}).certification).toBe(false);
    expect(analyzeLineFamily({...input,curve:parabola}).certification).toBe(false);
  });
  it("无两条割线时不创建非法的弦长之和试题",()=>{
    const r=analyzeLineFamily({...input,curve:parabola,through:{x:0,y:0},
      angles:[0,90],perpendicular:false,target:"chordSum"});
    expect(r.question).toBeNull();
    expect(r.value).toBeNull();
  });
});
