import { describe, expect, it } from "vitest";
import { renderDiagramFromDescription } from "../diagram-renderer";
import {
  normalizeDiagramDescription,
  validateDiagramDescription,
} from "../diagram-description";

const fnGraph = (functions: unknown[], keyPoints?: unknown[]) =>
  ({
    shapeType: "function-graph",
    vertices: [],
    functions,
    keyPoints,
  }) as never;

describe("函数图端到端渲染", () => {
  it("一次函数与二次函数各产出 1 条曲线（原实现完全画不出）", () => {
    const svg = renderDiagramFromDescription(
      fnGraph([{ expr: "y=2x+1" }, { expr: "y=x^2-2x+1" }]),
    );
    const polylines = svg.match(/<polyline/g) ?? [];
    expect(polylines).toHaveLength(2);
  });

  it("二次函数支持上标写法", () => {
    const svg = renderDiagramFromDescription(fnGraph([{ expr: "y=x²-2x+1" }]));
    expect(svg.match(/<polyline/g) ?? []).toHaveLength(1);
  });

  it("反比例函数跨 0 时输出 2 段 polyline（两支不相连）", () => {
    const svg = renderDiagramFromDescription(
      fnGraph([{ expr: "y=1/x", domain: [-5, 5] }]),
    );
    expect(svg.match(/<polyline/g) ?? []).toHaveLength(2);
  });

  it("SVG 中不含调试垃圾文字与无效坐标", () => {
    const svg = renderDiagramFromDescription(
      fnGraph([{ expr: "y=1/x", domain: [-5, 5] }, { expr: "y=2x+1" }], [
        { x: 1, y: 1, label: "A" },
      ]),
    );
    expect(svg).not.toContain("__curve");
    expect(svg).not.toContain("__axis");
    expect(svg).not.toContain("__origin");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });

  it("关键点标签被正常渲染", () => {
    const svg = renderDiagramFromDescription(
      fnGraph([{ expr: "y=2x+1" }], [{ x: 1, y: 3, label: "A" }]),
    );
    expect(svg).toContain(">A</text>");
  });

  it("坐标轴含刻度与 x/y 轴名称", () => {
    const svg = renderDiagramFromDescription(fnGraph([{ expr: "y=2x+1" }]));
    expect(svg).toContain(">x</text>");
    expect(svg).toContain(">y</text>");
    expect(svg).toContain(">O</text>");
  });

  it("部分曲线失败时明确报错，不能提供缺失曲线的题图", () => {
    expect(() => renderDiagramFromDescription(fnGraph([{ expr: "y=2x+" }, { expr: "y=2x+1" }]))).toThrow("函数表达式无法绘制");
  });

  it("全部曲线失败时不提供仅有坐标轴的假完整题图", () => {
    expect(() => renderDiagramFromDescription(fnGraph([{ expr: "y=x2" }], [{ x: 1, y: 1, label: "A" }]))).toThrow("函数表达式无法绘制");
  });

  it("几何图形（非函数图）回归：三角形正常渲染", () => {
    const svg = renderDiagramFromDescription({
      shapeType: "single-triangle",
      vertices: [{ label: "A" }, { label: "B" }, { label: "C" }],
      polygons: [{ vertices: ["A", "B", "C"] }],
    } as never);
    expect(svg).toContain("<polygon");
    expect(svg).toContain(">A</text>");
    expect(svg).not.toContain("__curve");
  });

  it("几何图形回归：共线三角形绘制底边与非共线边", () => {
    const svg = renderDiagramFromDescription({
      shapeType: "collinear-triangles",
      vertices: [{ label: "A" }, { label: "G" }, { label: "B" }, { label: "D" }],
      collinear: [{ points: ["A", "G", "B"] }],
      polygons: [{ vertices: ["A", "D", "B"] }],
    } as never);
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<line");
    expect(svg).toContain(">D</text>");
  });
});

describe("diagramDescription 校验", () => {
  it("function-graph 缺少 functions 与 keyPoints 时判为非法", () => {
    expect(
      validateDiagramDescription({ shapeType: "function-graph", vertices: [] }),
    ).toBeNull();
  });

  it("function-graph 带 functions 时合法", () => {
    expect(
      validateDiagramDescription({
        shapeType: "function-graph",
        vertices: [],
        functions: [{ expr: "y=2x+1" }],
      }),
    ).not.toBeNull();
  });

  it("normalize 把 LaTeX 表达式转成可解析形式", () => {
    const desc = normalizeDiagramDescription({
      shapeType: "function-graph",
      vertices: [],
      functions: [{ expr: "y=\\frac{1}{x}" }, { expr: "y=x^{2}-2x+1" }],
    });
    expect(desc?.functions?.[0].expr).toBe("y=(1)/(x)");
    expect(desc?.functions?.[1].expr).toBe("y=x^2-2x+1");
  });

  it("LaTeX 表达式经 normalize 后可正常渲染出图", () => {
    const desc = normalizeDiagramDescription({
      shapeType: "function-graph",
      vertices: [],
      functions: [{ expr: "y=\\frac{1}{x}", domain: [0.2, 5] }],
    });
    expect(desc).not.toBeNull();
    const svg = renderDiagramFromDescription(desc as never);
    expect(svg.match(/<polyline/g) ?? []).toHaveLength(1);
  });
});
