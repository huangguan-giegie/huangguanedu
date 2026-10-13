import { describe, expect, it } from "vitest";
import { renderDiagramFromDescription } from "../diagram-renderer";
import {
  normalizeDiagramDescription,
  validateDiagramDescription,
} from "../diagram-description";
import { computeLayout, diagramPremiseViolations, type Point, type VertexMap } from "./layout-engine";

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

// ---------- N-02 图形保真度回归 ----------
// 这一组全部来自 E2E 测试里「图看着对、其实结论反了」的失败样例：
// 矩形被画成斜的、折叠像点跑出画布、垂足跑到圆周上、直角标记消失。

/** 点到直线的距离（用于断言「某点在某条线上」） */
function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return Infinity;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
}

function point(map: VertexMap, label: string): Point {
  const found = map.get(label);
  if (!found) throw new Error(`顶点 ${label} 没有算出来`);
  return found;
}

const build = (raw: unknown) => {
  const desc = normalizeDiagramDescription(raw);
  if (!desc) throw new Error("图描述校验未通过");
  return desc;
};

describe("N-02 矩形必须保持直角", () => {
  it("rectangle 不加倾斜量：对边水平、邻边竖直", () => {
    const desc = build({
      shapeType: "rectangle",
      vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
    });
    const map = computeLayout(desc);
    const a = point(map, "A");
    const b = point(map, "B");
    const c = point(map, "C");
    const d = point(map, "D");
    // 原本矩形只能写成 parallelogram，被统一 skew 25%，画出来是斜的
    expect(a.y).toBeCloseTo(b.y, 1);
    expect(d.y).toBeCloseTo(c.y, 1);
    expect(a.x).toBeCloseTo(d.x, 1);
    expect(b.x).toBeCloseTo(c.x, 1);
  });

  it("给了两条邻边长就按真实比例画（竖版矩形不会被画成横版）", () => {
    const wide = computeLayout(build({
      shapeType: "rectangle",
      vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      sides: { AB: 16, BC: 6 },
    }));
    const tall = computeLayout(build({
      shapeType: "rectangle",
      vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      sides: { AB: 8, BC: 12 },
    }));
    const ratio = (m: VertexMap) => (point(m, "A").y - point(m, "D").y) / (point(m, "B").x - point(m, "A").x);
    expect(ratio(wide)).toBeLessThan(1); // 横版：高 < 宽
    expect(ratio(tall)).toBeGreaterThan(1); // 竖版：高 > 宽
    expect(ratio(wide)).toBeCloseTo(6 / 16, 1);
    expect(ratio(tall)).toBeCloseTo(12 / 8, 1);
  });
});

describe("N-02 派生点靠坐标算出来，不能当主顶点占位", () => {
  const circleCase = {
    shapeType: "circle",
    vertices: [
      { label: "O" },
      { label: "A" },
      { label: "B" },
      { label: "C" },
      { label: "D", foot: { from: "C", to: ["A", "B"] } },
    ],
    circles: [{ center: "O", radiusPoint: "B" }],
    collinear: [{ points: ["A", "O", "B"] }],
    segments: [{ from: "C", to: "D" }, { from: "A", to: "C" }, { from: "C", to: "B" }],
  };

  it("声明 A、O、B 共线时 AB 是过圆心的真直径（不是普通弦）", () => {
    const map = computeLayout(build(circleCase));
    const o = point(map, "O");
    const a = point(map, "A");
    const b = point(map, "B");
    expect(a.y).toBeCloseTo(o.y, 1);
    expect(b.y).toBeCloseTo(o.y, 1);
    const radius = Math.hypot(b.x - o.x, b.y - o.y);
    expect(Math.hypot(a.x - o.x, a.y - o.y)).toBeCloseTo(radius, 0);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(radius * 2, 0);
  });

  it("垂足 D 落在 AB 上且 CD⊥AB（此前 D 被当成圆周点顶到圆弧上）", () => {
    const map = computeLayout(build(circleCase));
    const a = point(map, "A");
    const b = point(map, "B");
    const c = point(map, "C");
    const d = point(map, "D");
    expect(pointToLineDistance(d, a, b)).toBeLessThan(0.5);
    const dot = (c.x - d.x) * (b.x - a.x) + (c.y - d.y) * (b.y - a.y);
    expect(Math.abs(dot) / (Math.hypot(c.x - d.x, c.y - d.y) * Math.hypot(b.x - a.x, b.y - a.y)))
      .toBeLessThan(1e-6);
  });

  it("圆上额外点不会落在正上方（否则垂足会压在圆心 O 上）", () => {
    const map = computeLayout(build(circleCase));
    const o = point(map, "O");
    const c = point(map, "C");
    // 正上方意味着 C 的横坐标与圆心完全一致
    expect(Math.abs(c.x - o.x)).toBeGreaterThan(20);
  });

  it("锐角三角形上的中点：D 在 AB 上、E 在 AC 上，DE 不一端悬空", () => {
    const map = computeLayout(build({
      shapeType: "single-triangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" },
        { label: "D", on: ["A", "B"], ratio: 0.33 },
        { label: "E", on: ["A", "C"], ratio: 0.33 },
      ],
      polygons: [{ vertices: ["A", "B", "C"] }],
      segments: [{ from: "D", to: "E" }],
    }));
    const a = point(map, "A");
    const b = point(map, "B");
    const c = point(map, "C");
    expect(pointToLineDistance(point(map, "D"), a, b)).toBeLessThan(0.5);
    expect(pointToLineDistance(point(map, "E"), a, c)).toBeLessThan(0.5);
    // 中位线应与底边平行
    const slope = (u: Point, v: Point) => (v.y - u.y) / (v.x - u.x);
    const d = point(map, "D");
    const e = point(map, "E");
    expect(slope(d, e)).toBeCloseTo(slope(b, c), 2);
  });

  it("轴对称像点 C′：BD 是 CC′ 的垂直平分线", () => {
    const map = computeLayout(build({
      shapeType: "rectangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" },
        { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
      ],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      segments: [{ from: "B", to: "D" }],
    }));
    const b = point(map, "B");
    const c = point(map, "C");
    const d = point(map, "D");
    const cp = point(map, "C′");
    const midpoint = { x: (c.x + cp.x) / 2, y: (c.y + cp.y) / 2 };
    expect(pointToLineDistance(midpoint, b, d)).toBeLessThan(0.5);
    const dot = (cp.x - c.x) * (d.x - b.x) + (cp.y - c.y) * (d.y - b.y);
    expect(Math.abs(dot) / (Math.hypot(cp.x - c.x, cp.y - c.y) * Math.hypot(d.x - b.x, d.y - b.y)))
      .toBeLessThan(1e-6);
  });

  it("两直线交点 E 确实同时在两条线上", () => {
    const map = computeLayout(build({
      shapeType: "rectangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" },
        { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
        { label: "E", intersect: ["B", "C′", "A", "D"] },
      ],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      segments: [{ from: "B", to: "D" }, { from: "B", to: "C′" }],
    }));
    const e = point(map, "E");
    expect(pointToLineDistance(e, point(map, "B"), point(map, "C′"))).toBeLessThan(0.5);
    expect(pointToLineDistance(e, point(map, "A"), point(map, "D"))).toBeLessThan(0.5);
  });
});

describe("N-02 直角标记与标签落位", () => {
  const rightAngleCase = {
    shapeType: "circle",
    vertices: [
      { label: "O" }, { label: "A" }, { label: "B" }, { label: "C" },
      { label: "D", foot: { from: "C", to: ["A", "B"] } },
    ],
    circles: [{ center: "O", radiusPoint: "B" }],
    collinear: [{ points: ["A", "O", "B"] }],
    segments: [{ from: "C", to: "D" }, { from: "A", to: "C" }, { from: "C", to: "B" }],
    marks: [{ type: "right-angle", at: "D" }],
  };

  it("垂足上的直角小方框必须画出来（此前被静默丢弃）", () => {
    const svg = renderDiagramFromDescription(build(rightAngleCase) as never);
    // 直角标记是全图唯一的 polyline（曲线才用 polyline，几何图不用）
    expect(svg.match(/<polyline/g) ?? []).toHaveLength(1);
  });

  it("顶点标签不能压在线段上：D 的标签须离开竖线 CD", () => {
    const desc = build(rightAngleCase);
    const map = computeLayout(desc);
    const svg = renderDiagramFromDescription(desc as never);
    const match = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>D<\/text>/.exec(svg);
    expect(match).not.toBeNull();
    const label = { x: Number(match?.[1]), y: Number(match?.[2]) };
    expect(pointToLineDistance(label, point(map, "C"), point(map, "D"))).toBeGreaterThan(10);
    // 也不能压在直径 AB 上
    expect(pointToLineDistance(label, point(map, "A"), point(map, "B"))).toBeGreaterThan(10);
  });

  it("所有顶点标签都落在画布内", () => {
    const svg = renderDiagramFromDescription(build(rightAngleCase) as never);
    const coords = Array.from(svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g));
    expect(coords.length).toBeGreaterThanOrEqual(5);
    for (const [, x, y] of coords) {
      expect(Number(x)).toBeGreaterThan(0);
      expect(Number(x)).toBeLessThan(400);
      expect(Number(y)).toBeGreaterThan(0);
      expect(Number(y)).toBeLessThan(300);
    }
  });
});

// ---------- R2-02 出题前提校验：交点/垂足必须落在线段上 ----------

describe("R2-02 出题前提校验", () => {
  it("折叠变式数据自洽时：E 在线段 BC′ 与 AD 上，无违规", () => {
    const desc = build({
      shapeType: "rectangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" },
        { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
        { label: "E", intersect: ["B", "C′", "A", "D"] },
      ],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      sides: { AB: 6, BC: 8 },
      segments: [{ from: "B", to: "D" }, { from: "B", to: "C′" }],
    });
    const map = computeLayout(desc);
    expect(diagramPremiseViolations(desc, map)).toEqual([]);
  });

  it("第二轮线上实例：AB/BC 交换成 8/6 后，E 落在延长线上 → 必须报违规", () => {
    const desc = build({
      shapeType: "rectangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" },
        { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
        { label: "E", intersect: ["B", "C′", "A", "D"] },
      ],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      sides: { AB: 8, BC: 6 },
      segments: [{ from: "B", to: "D" }, { from: "B", to: "C′" }],
    });
    const map = computeLayout(desc);
    const violations = diagramPremiseViolations(desc, map);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("E");
    expect(violations[0]).toContain("延长线");
  });

  it("垂足在线段上不报违规；ratio 越界报违规", () => {
    const okDesc = build({
      shapeType: "circle",
      vertices: [
        { label: "O" }, { label: "A" }, { label: "B" }, { label: "C" },
        { label: "D", foot: { from: "C", to: ["A", "B"] } },
      ],
      circles: [{ center: "O", radiusPoint: "B" }],
      collinear: [{ points: ["A", "O", "B"] }],
      segments: [{ from: "C", to: "D" }],
    });
    expect(diagramPremiseViolations(okDesc, computeLayout(okDesc))).toEqual([]);

    const badDesc = build({
      shapeType: "single-triangle",
      vertices: [
        { label: "A" }, { label: "B" }, { label: "C" },
        { label: "D", on: ["A", "B"], ratio: 1.4 },
      ],
      polygons: [{ vertices: ["A", "B", "C"] }],
      segments: [{ from: "C", to: "D" }],
    });
    const violations = diagramPremiseViolations(badDesc, computeLayout(badDesc));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("ratio");
  });
});
