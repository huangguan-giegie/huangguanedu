import { describe, expect, it } from "vitest";
import { compileDiagramProblem, PracticeDiagramSchema } from "./practice-diagram";
import {
  AdvancedDiagramSchema, exactPi, linearEquation, quadraticEquation,
  rootFactor, vertexEquation,
} from "./practice-advanced-diagram";

describe("高级几何与函数图形的一致性", () => {
  it("扇形弧长和面积只使用精确的 π 分数", () => {
    for (const radius of [2, 3, 5, 8, 12]) {
      for (const centralAngle of [30,45,60,90,120] as const) {
        const arc = compileDiagramProblem({ type:"circle_sector", radius, centralAngle, task:"ARC_LENGTH" });
        const area = compileDiagramProblem({ type:"circle_sector", radius, centralAngle, task:"SECTOR_AREA" });
        expect(arc.answer).toBe(`${exactPi(radius * centralAngle, 180)} cm`);
        expect(area.answer).toBe(`${exactPi(radius * radius * centralAngle, 360)} cm²`);
        expect(arc.question).toContain(`${centralAngle}°`);
        expect(area.question).toContain(`${radius} cm`);
      }
    }
    expect(exactPi(1,2)).toBe("π/2");
    expect(exactPi(5,1)).toBe("5π");
    expect(exactPi(6,3)).toBe("2π");
  });

  it("同弧对应的圆周角等于圆心角一半", () => {
    for (const centralAngle of [60,80,90,100,120,140] as const) {
      const problem = compileDiagramProblem({type:"circle_inscribed_angle",centralAngle});
      expect(problem.answer).toBe(`${centralAngle/2}°`);
      expect(problem.question).toContain("∠ACB");
      expect(problem.question).toContain(`${centralAngle}°`);
    }
  });

  it("辅助高线保证面积等于底乘高除二", () => {
    for (const base of [6,10,14,20,24]) {
      for (const height of [2,5,8,15]) {
        for (const foot of ["LEFT","MIDDLE","RIGHT"] as const) {
          const problem = compileDiagramProblem({type:"triangle_altitude",base,height,foot});
          expect(problem.answer).toBe(`${base*height/2} cm²`);
          expect(problem.question).toContain(`AB＝${base} cm`);
          expect(problem.question).toContain(`CD＝${height} cm`);
        }
      }
    }
  });

  it("中位线由两边中点构造且长度总为第三边的一半", () => {
    for (const base of [4,6,10,14,18,24]) {
      const problem = compileDiagramProblem({type:"triangle_midline",base});
      expect(problem.answer).toBe(`${base/2} cm`);
      expect(problem.explanation).toContain("MN∥BC");
    }
  });

  it("顶点式顶点坐标及对称轴与系数一致", () => {
    for (const a of [-2,-1,1,2]) for (const h of [-2,0,2]) for (const k of [-4,1,4]) {
      const problem = compileDiagramProblem({type:"quadratic_vertex",a,h,k});
      expect(problem.question).toContain(vertexEquation(a,h,k));
      expect(problem.answer).toBe(`顶点(${h}, ${k})，对称轴 x = ${h}`);
      // Substituting the vertex into the actual parabola always yields k.
      expect(a*(h-h)**2+k).toBe(k);
    }
  });

  it("不同斜率的两条直线在规定整数坐标精确相交", () => {
    const slopePairs = ["1,-1","2,-1","1,-2","-1,2","-2,1","2,-2"] as const;
    for (const slopes of slopePairs) for (const x of [-2,0,2]) for (const y of [-3,0,3]) {
      const problem = compileDiagramProblem({type:"linear_intersection",slopes,x,y});
      const [m1,m2] = slopes.split(",").map(Number);
      const b1=y-m1*x,b2=y-m2*x;
      expect(m1).not.toBe(m2);
      expect(m1*x+b1).toBe(y);
      expect(m2*x+b2).toBe(y);
      expect(problem.answer).toBe(`P(${x}, ${y})`);
      expect(problem.question).toContain(linearEquation(m1,b1));
      expect(problem.question).toContain(linearEquation(m2,b2));
    }
  });

  it("抛物线与直线恰有两个规定的实数交点", () => {
    for (const roots of ["-3,1","-2,2","-1,3","-3,2","-1,2","0,3","-2,1"] as const) {
      for (const slope of [-2,-1,0,1,2]) for (const intercept of [-3,0,3]) {
        const [r1,r2] = roots.split(",").map(Number);
        const problem = compileDiagramProblem({type:"quadratic_line_intersection",roots,slope,intercept});
        expect(r1).not.toBe(r2);
        const b = slope-r1-r2,c = r1*r2+intercept;
        for (const x of [r1,r2]) {
          expect(x*x+b*x+c).toBe(slope*x+intercept);
        }
        expect(problem.question).toContain(quadraticEquation(1,b,c));
        expect(problem.answer).toBe(`A(${r1}, ${slope*r1+intercept})，B(${r2}, ${slope*r2+intercept})`);
        expect(problem.explanation).toContain(rootFactor(r1));
        expect(problem.explanation).toContain(rootFactor(r2));
      }
    }
  });

  it("拒绝无效角度、非直角高线参数与重根/平行直线", () => {
    const invalid = [
      {type:"circle_sector",radius:3,centralAngle:200,task:"ARC_LENGTH"},
      {type:"circle_sector",radius:0,centralAngle:60,task:"ARC_LENGTH"},
      {type:"circle_inscribed_angle",centralAngle:170},
      {type:"triangle_altitude",base:7,height:8,foot:"MIDDLE"},
      {type:"triangle_altitude",base:12,height:-1,foot:"MIDDLE"},
      {type:"triangle_midline",base:9},
      {type:"quadratic_vertex",a:0,h:1,k:2},
      {type:"linear_intersection",slopes:"1,1",x:0,y:1},
      {type:"quadratic_line_intersection",roots:"1,1",slope:1,intercept:0},
      {type:"quadratic_line_intersection",roots:"-2,2",slope:100,intercept:0},
    ];
    for (const sample of invalid) {
      expect(AdvancedDiagramSchema.safeParse(sample).success, JSON.stringify(sample)).toBe(false);
      expect(PracticeDiagramSchema.safeParse(sample).success, JSON.stringify(sample)).toBe(false);
    }
  });
});
