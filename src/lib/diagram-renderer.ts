/**
 * 几何图形程序化渲染器主入口：
 * 输入 diagramDescription（拓扑描述） → 输出 SVG 字符串（确定性坐标）。
 */
import type { DiagramDescription } from "./diagram-description";
import { primaryPolygon } from "./diagram-description";
import { computeLayout } from "./diagram-renderer/layout-engine";
import { buildSvg } from "./diagram-renderer/svg-builder";
import { computeFunctionCurves } from "./diagram-renderer/curve-sampler";

/** 多函数配色与网站方案 C 保持一致。 */
const CURVE_COLORS = ["#39323f", "#D85A30", "#1D9E75", "#7F77DD", "#BA7517"];

/**
 * 根据 diagramDescription 确定性渲染 SVG。
 * 坐标全部由程序计算，不依赖 AI 的像素坐标，保证：
 * - 共线点 y 坐标完全相同（不断裂）
 * - 对称三角形等高（对称）
 * - 线段端点精确连接（无缺口）
 * - 函数曲线在不连续点处切分（不画出跨渐近线的假连线）
 */
export function renderDiagramFromDescription(desc: DiagramDescription): string {
  const isFunctionGraph = desc.shapeType === "function-graph";
  const vertexMap = computeLayout(desc);

  // 函数图的顶点表恒为空（曲线/坐标轴由 curve-sampler 计算），
  // 因此不能用 vertexMap.size 判断是否为空白图。
  if (vertexMap.size === 0 && !isFunctionGraph) {
    throw new Error("几何示意图缺少可绘制的顶点");
  }

  if (isFunctionGraph) {
    return renderFunctionGraph(desc);
  }

  // 从 collinear 提取共线底边
  const collinearBase = desc.collinear?.[0]?.points;

  // 主多边形：只由主顶点构成，不含垂足/交点/折叠像点等辅助点。
  // 原实现在这里用「全部顶点」兜底，加入辅助点后会把三角形画成五边形。
  const primary = primaryPolygon(desc);

  // extraLines：题目显式声明的辅助线（垂线、对角线、折痕） + 非共线的多边形边
  const extraLines: Array<{ from: string; to: string; dashed?: boolean }> = [];
  for (const segment of desc.segments ?? []) {
    extraLines.push({ from: segment.from, to: segment.to, dashed: segment.dashed });
  }
  if (desc.polygons && collinearBase) {
    const collinearSet = new Set(collinearBase);
    for (const poly of desc.polygons) {
      for (let i = 0; i < poly.vertices.length; i++) {
        const a = poly.vertices[i];
        const b = poly.vertices[(i + 1) % poly.vertices.length];
        // 只画非共线的边（共线的边由 collinearBase 直线覆盖）
        if (!collinearSet.has(a) || !collinearSet.has(b)) {
          extraLines.push({ from: a, to: b });
        }
      }
    }
  }

  const polygonVertices = desc.polygons?.map((poly) => poly.vertices) ?? [];
  if (!polygonVertices.length && ["single-triangle", "parallelogram", "rectangle"].includes(desc.shapeType) && primary.length >= 3) {
    polygonVertices.push(primary);
  }

  // 辅助点需要单独画点，否则只有一个悬空标签看不出位置
  const primarySet = new Set(primary);
  const auxiliaryLabels = desc.vertices.filter((v) => !primarySet.has(v.label)).map((v) => v.label);

  return buildSvg(vertexMap, {
    polygons: polygonVertices.map((vertices) => ({ vertices })),
    circles: desc.circles,
    collinearBase,
    marks: desc.marks,
    extraLines,
    auxiliaryLabels,
  });
}

/** 函数图渲染：坐标轴 + 刻度 + 分段曲线 + 关键点 + 图例 */
function renderFunctionGraph(desc: DiagramDescription): string {
  const layout = computeFunctionCurves(desc);

  if (layout.errors.length > 0) {
    throw new Error(`函数表达式无法绘制：${layout.errors.map((e) => e.message).join("；")}`);
  }
  if (!layout.curves.length || layout.curves.some((curve) => !curve.segments.length)) {
    throw new Error("函数在指定定义域中没有有效曲线，请重新生成");
  }

  // 多函数自动配色；单条曲线沿用默认深色
  const curves = layout.curves.map((curve, index) => ({
    segments: curve.segments,
    color: curve.color !== "#39323f" ? curve.color : CURVE_COLORS[index % CURVE_COLORS.length],
  }));

  const legend =
    curves.length > 1
      ? curves.map((curve, index) => ({
          text: desc.functions?.[index]?.expr ?? `曲线${index + 1}`,
          color: curve.color,
        }))
      : undefined;

  // keyPoints 作为顶点标签渲染
  const vertexMap = new Map<string, { x: number; y: number }>();
  for (const kp of layout.keyPoints) {
    vertexMap.set(kp.label, kp.point);
  }

  return buildSvg(vertexMap, {
    functionAxes: layout.axes ?? undefined,
    curves,
    ticks: layout.ticks,
    legend,
  });
}
