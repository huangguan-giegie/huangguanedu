import { describe, expect, it } from "vitest";
import { compileDiagramProblem, PracticeDiagramSchema, refersToMissingFigure } from "./practice-diagram";

describe("可验证的数学图形题", () => {
  it("同一长宽产生一致的题干、答案与绘图数据", () => {
    const p = compileDiagramProblem({ type: "rectangle", width: 6, height: 4, task: "AREA" });
    expect(p.question).toContain("6 cm");
    expect(p.question).toContain("4 cm");
    expect(p.answer).toBe("24 cm²");
    expect(p.explanation).toContain("6×4");
    expect(p.diagram).toEqual({ type: "rectangle", width: 6, height: 4, task: "AREA" });
  });

  it("长方形周长使用周长公式", () => {
    const p = compileDiagramProblem({ type: "rectangle", width: 7, height: 3, task: "PERIMETER" });
    expect(p.answer).toBe("20 cm");
    expect(p.explanation).toContain("2×（7＋3）");
  });

  it("勾股三元组确保文字与三角形的边长一致", () => {
    for (const triple of ["3-4-5", "5-12-13", "8-15-17", "7-24-25"] as const) {
      const p = compileDiagramProblem({ type: "right_triangle", triple });
      const [a,b,c] = triple.split("-").map(Number);
      expect(a * a + b * b).toBe(c * c);
      expect(p.answer).toBe(`${c} cm`);
      expect(p.question).toContain(`AB＝${a} cm`);
    }
  });

  it("两点坐标可还原唯一正确的直线方程", () => {
    const p = compileDiagramProblem({ type: "linear_function", slope: -2, intercept: 3 });
    expect(p.question).toContain("A(0, 3)");
    expect(p.question).toContain("B(1, 1)");
    expect(p.answer).toBe("y = -2x + 3");
  });

  it("非法图形参数被拒绝，禁止产生似是而非的配图", () => {
    expect(PracticeDiagramSchema.safeParse({ type: "rectangle", width: -2, height: 6, task: "AREA" }).success).toBe(false);
    expect(PracticeDiagramSchema.safeParse({ type: "right_triangle", triple: "3-4-6" }).success).toBe(false);
    expect(PracticeDiagramSchema.safeParse({ type: "linear_function", slope: 0, intercept: 2 }).success).toBe(false);
    expect(PracticeDiagramSchema.safeParse({ type: "random_svg", html: "<script>bad</script>" }).success).toBe(false);
  });

  it("未绑定图形的引用图形题被识别", () => {
    expect(refersToMissingFigure("如图，求角 A 的大小")).toBe(true);
    expect(refersToMissingFigure("计算 2x+1=3")).toBe(false);
  });
});
