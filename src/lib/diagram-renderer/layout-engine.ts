/**
 * 布局引擎：根据 diagramDescription 的拓扑描述，计算每个顶点的精确 SVG 坐标。
 * 所有坐标由程序确定性计算，不再依赖 AI 的像素坐标。
 */
import type { DiagramDescription } from "../diagram-description";
import { BASE_Y, CANVAS_WIDTH, CANVAS_HEIGHT, MARGIN, TRI_HEIGHT } from "./constants";

export type Point = { x: number; y: number };

/** 顶点 label → 坐标的映射 */
export type VertexMap = Map<string, Point>;

/** 布局引擎：根据 diagramDescription 输出 label → 坐标映射 */
export function computeLayout(desc: DiagramDescription): VertexMap {
  switch (desc.shapeType) {
    case "single-triangle":
      return layoutSingleTriangle(desc);
    case "collinear-triangles":
      return layoutCollinearTriangles(desc);
    case "parallelogram":
      return layoutParallelogram(desc);
    case "circle":
      return layoutCircle(desc);
    case "intersecting-lines":
      return layoutIntersectingLines(desc);
    case "function-graph":
      // 函数图的曲线、坐标轴、关键点全部由 curve-sampler 的 computeFunctionCurves 计算。
      // 这里返回空 Map —— 原实现把曲线点数组以 `__curve0` 等内部 key 塞进顶点表，
      // 导致 svg-builder 遍历顶点时把它们当成标签渲染出调试垃圾文字。
      return new Map();
    default:
      return new Map();
  }
}

// ---------- 单三角形 ----------

function layoutSingleTriangle(desc: DiagramDescription): VertexMap {
  const vertices = desc.vertices.map((v) => v.label);
  if (vertices.length < 3) return new Map();
  const [a, b, c] = vertices;
  const result: VertexMap = new Map();
  // 底边 A(左) B(右)，顶点 C(上)
  result.set(a, { x: MARGIN, y: BASE_Y });
  result.set(b, { x: CANVAS_WIDTH - MARGIN, y: BASE_Y });
  result.set(c, { x: CANVAS_WIDTH / 2, y: BASE_Y - TRI_HEIGHT });
  return result;
}

// ---------- 共线底边 + 三角形（最常见题型，本案例） ----------

function layoutCollinearTriangles(desc: DiagramDescription): VertexMap {
  const result: VertexMap = new Map();

  // 1. 布局共线点：等间距排列在水平线 y=BASE_Y 上
  const collinearGroup = desc.collinear?.[0];
  if (collinearGroup) {
    const n = collinearGroup.points.length;
    const leftX = MARGIN;
    const rightX = CANVAS_WIDTH - MARGIN;
    const spacing = n > 1 ? (rightX - leftX) / (n - 1) : 0;
    collinearGroup.points.forEach((label, i) => {
      result.set(label, { x: leftX + i * spacing, y: BASE_Y });
    });
  }

  // 2. 三角形顶点（共线点上方的顶点）
  const triangles = desc.polygons ?? [];
  const triHeight = TRI_HEIGHT;
  for (const tri of triangles) {
    const pts = tri.vertices;
    if (pts.length !== 3) continue;
    // 找出底边（两个点在共线组里）和顶点（不在共线组里的那个）
    const collinearSet = new Set(collinearGroup?.points ?? []);
    const basePoints = pts.filter((p) => collinearSet.has(p));
    const apex = pts.find((p) => !collinearSet.has(p));
    if (basePoints.length === 2 && apex) {
      const p1 = result.get(basePoints[0]);
      const p2 = result.get(basePoints[1]);
      if (p1 && p2) {
        result.set(apex, {
          x: (p1.x + p2.x) / 2,
          y: BASE_Y - triHeight,
        });
      }
    }
  }

  return result;
}

// ---------- 平行四边形 / 菱形 ----------

function layoutParallelogram(desc: DiagramDescription): VertexMap {
  const vertices = desc.vertices.map((v) => v.label);
  if (vertices.length < 4) return new Map();
  const [a, b, c, d] = vertices;
  const result: VertexMap = new Map();
  const w = (CANVAS_WIDTH - 2 * MARGIN) / 1.25;
  const h = TRI_HEIGHT;
  const skew = w * 0.25; // 倾斜量
  // A(左下) B(右下) C(右上) D(左上)
  result.set(a, { x: MARGIN, y: BASE_Y });
  result.set(b, { x: MARGIN + w, y: BASE_Y });
  result.set(c, { x: MARGIN + w + skew, y: BASE_Y - h });
  result.set(d, { x: MARGIN + skew, y: BASE_Y - h });
  return result;
}

// ---------- 圆 ----------

function layoutCircle(desc: DiagramDescription): VertexMap {
  const result: VertexMap = new Map();
  const circles = desc.circles;
  if (!circles || circles.length === 0) return result;
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.35;
  // 圆心
  result.set(circles[0].center, { x: cx, y: cy });
  // 半径端点（右侧）
  result.set(circles[0].radiusPoint, { x: cx + radius, y: cy });
  // 其他圆周点
  const onCircle = desc.vertices
    .filter((v) => v.label !== circles[0].center && v.label !== circles[0].radiusPoint)
    .map((v) => v.label);
  onCircle.forEach((label, i, arr) => {
    const angle = Math.PI + (Math.PI * (i + 1)) / (arr.length + 1);
    result.set(label, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });
  return result;
}

// ---------- 相交线 / 角 ----------

function layoutIntersectingLines(desc: DiagramDescription): VertexMap {
  const result: VertexMap = new Map();
  const collinearGroup = desc.collinear?.[0];
  if (!collinearGroup || collinearGroup.points.length < 2) return result;
  // 共线点水平排列
  const n = collinearGroup.points.length;
  const leftX = MARGIN;
  const rightX = CANVAS_WIDTH - MARGIN;
  const spacing = n > 1 ? (rightX - leftX) / (n - 1) : 0;
  collinearGroup.points.forEach((label, i) => {
    result.set(label, { x: leftX + i * spacing, y: BASE_Y });
  });
  // 非共线点（角的另一边）：从中间点向上延伸
  const nonCollinear = desc.vertices
    .filter((v) => !collinearGroup.points.includes(v.label))
    .map((v) => v.label);
  const midIndex = Math.floor(n / 2);
  const midPoint = result.get(collinearGroup.points[midIndex]);
  if (midPoint && nonCollinear.length > 0) {
    nonCollinear.forEach((label, i) => {
      const angle = -Math.PI / 2 + ((i + 1 - (nonCollinear.length + 1) / 2) * Math.PI) / 6;
      result.set(label, {
        x: midPoint.x + TRI_HEIGHT * Math.cos(angle),
        y: BASE_Y + TRI_HEIGHT * Math.sin(angle),
      });
    });
  }
  return result;
}
