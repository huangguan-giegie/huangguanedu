/**
 * diagramDescription 的 schema 回归测试。
 *
 * 重点覆盖 N-02 新增的几何关系声明（rectangle / reflect / intersect / foot / sides）：
 * 这些字段的用途是「让 AI 把图形的几何关系说清楚」，一旦校验放水，
 * 渲染器就会拿到没法算坐标的描述，最后画出一张看着对、其实结论反了的图。
 */
import { describe, expect, it } from "vitest";

import {
  normalizeDiagramDescription,
  primaryPolygon,
  sideLength,
  validateDiagramDescription,
} from "./diagram-description";

const rect = (extra: Record<string, unknown> = {}) => ({
  shapeType: "rectangle",
  vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
  polygons: [{ vertices: ["A", "B", "C", "D"] }],
  ...extra,
});

describe("primaryPolygon：只认主顶点", () => {
  it("垂足、交点、折叠像点都不算主顶点", () => {
    const desc = normalizeDiagramDescription({
      shapeType: "rectangle",
      vertices: [
        { label: "A" },
        { label: "B" },
        { label: "C" },
        { label: "D" },
        { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
        { label: "E", intersect: ["B", "C′", "A", "D"] },
      ],
      polygons: [{ vertices: ["A", "B", "C", "D"] }],
      segments: [{ from: "B", to: "D" }, { from: "B", to: "C′" }],
    });
    expect(desc).not.toBeNull();
    // 若把辅助点算进来，四个主顶点会变成六个，多边形被画成六边形
    expect(primaryPolygon(desc as never)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("sideLength：边长查表与顺序无关", () => {
  it("AB 与 BA 都能查到", () => {
    const desc = normalizeDiagramDescription(rect({ sides: { AB: 8, BC: 12 } }));
    expect(sideLength(desc as never, "A", "B")).toBe(8);
    expect(sideLength(desc as never, "B", "A")).toBe(8);
    expect(sideLength(desc as never, "B", "C")).toBe(12);
  });

  it("没给这条边时返回 undefined，渲染端才有机会用默认比例", () => {
    const desc = normalizeDiagramDescription(rect({ sides: { AB: 8 } }));
    expect(sideLength(desc as never, "C", "D")).toBeUndefined();
  });
});

describe("校验：rectangle 顶点数按四边形要求", () => {
  it("四个主顶点合法", () => {
    expect(validateDiagramDescription(rect())).not.toBeNull();
  });

  it("只有三个主顶点判为非法", () => {
    expect(
      validateDiagramDescription({
        shapeType: "rectangle",
        vertices: [{ label: "A" }, { label: "B" }, { label: "C" }],
      }),
    ).toBeNull();
  });
});

describe("校验：辅助点必须声明几何关系", () => {
  it("没有任何来源的辅助点判为非法（否则没有坐标可算）", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "E" }],
      }),
    ).toBeNull();
  });

  it("带 foot 的垂足合法", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "F", foot: { from: "C", to: ["A", "B"] } }],
      }),
    ).not.toBeNull();
  });
});

describe("校验：几何关系引用的合法性", () => {
  it("foot 引用不存在的点判为非法", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "F", foot: { from: "C", to: ["A", "Z"] } }],
      }),
    ).toBeNull();
  });

  it("reflect 引用不存在的对称轴端点判为非法", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "C′", reflect: { of: "C", axis: ["B", "Z"] } }],
      }),
    ).toBeNull();
  });

  it("intersect 列出四个端点：两两成线", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [
          ...rect().vertices,
          { label: "C′", reflect: { of: "C", axis: ["B", "D"] } },
          { label: "E", intersect: ["B", "C′", "A", "D"] },
        ],
      }),
    ).not.toBeNull();
  });

  it("intersect 点数不合法时判为非法", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "E", intersect: ["A", "B", "C"] }],
      }),
    ).toBeNull();
  });

  it("reflect 的对称轴两个端点不能相同", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [...rect().vertices, { label: "C′", reflect: { of: "C", axis: ["B", "B"] } }],
      }),
    ).toBeNull();
  });
});

describe("校验：几何引用必须指向已存在的顶点", () => {
  it("collinear 引用不存在的点判为非法", () => {
    expect(
      validateDiagramDescription({
        shapeType: "circle",
        vertices: [{ label: "O" }, { label: "A" }, { label: "B" }],
        circles: [{ center: "O", radiusPoint: "B" }],
        collinear: [{ points: ["A", "O", "Z"] }],
      }),
    ).toBeNull();
  });

  it("圆图缺少圆定义判为非法", () => {
    expect(
      validateDiagramDescription({
        shapeType: "circle",
        vertices: [{ label: "O" }, { label: "A" }, { label: "B" }],
      }),
    ).toBeNull();
  });

  it("顶点标识重复判为非法", () => {
    expect(
      validateDiagramDescription({
        ...rect(),
        vertices: [{ label: "A" }, { label: "A" }, { label: "B" }, { label: "C" }],
      }),
    ).toBeNull();
  });
});

describe("第三轮线上实例：双三角形与圆内接多边形不再被误拒", () => {
  it("圆内接四边形：圆心 O 是主顶点，不要求声明 on/reflect", () => {
    expect(
      validateDiagramDescription({
        shapeType: "circle",
        vertices: [{ label: "O" }, { label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
        circles: [{ center: "O", radiusPoint: "A" }],
        collinear: [{ points: ["A", "O", "B"] }],
        polygons: [{ vertices: ["A", "B", "C", "D"] }],
        segments: [{ from: "A", to: "C", dashed: true }],
      }),
    ).not.toBeNull();
  });

  it("全等/相似的双三角形：两个 polygons 的顶点都是主顶点", () => {
    expect(
      validateDiagramDescription({
        shapeType: "collinear-triangles",
        vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }, { label: "F" }],
        collinear: [{ points: ["B", "E", "C", "F"] }],
        polygons: [{ vertices: ["A", "B", "C"] }, { vertices: ["D", "E", "F"] }],
        segments: [{ from: "A", to: "C" }, { from: "D", to: "F" }],
      }),
    ).not.toBeNull();
  });

  it("多边形仍兼容数组简写 [[\"A\",\"B\",\"C\"]]", () => {
    expect(
      validateDiagramDescription({
        shapeType: "single-triangle",
        vertices: [{ label: "A" }, { label: "B" }, { label: "C" }],
        polygons: [["A", "B", "C"]],
      }),
    ).not.toBeNull();
  });
});
