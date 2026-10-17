/**
 * 布局引擎：根据 diagramDescription 的拓扑描述，计算每个顶点的精确 SVG 坐标。
 * 所有坐标由程序确定性计算，不再依赖 AI 的像素坐标。
 */
import type { DiagramDescription } from "../diagram-description";
import { primaryPolygon, sideLength } from "../diagram-description";
import { BASE_Y, CANVAS_WIDTH, CANVAS_HEIGHT, MARGIN, TRI_HEIGHT, FONT_SIZE, LABEL_OFFSET } from "./constants";

export type Point = { x: number; y: number };

/** 顶点 label → 坐标的映射 */
export type VertexMap = Map<string, Point>;

/**
 * 「派生点」：坐标由几何关系推导而来（on / reflect / intersect / foot），
 * 不能由主图形布局先占位，否则 placeAuxiliaryVertices 会因为 map 里已有坐标而跳过它，
 * 结果把垂足画到圆周上这类离谱位置。每个 layout 函数都必须先排除它们。
 */
function derivedLabels(desc: DiagramDescription): Set<string> {
  return new Set(
    desc.vertices
      .filter((v) => v.on || v.reflect || v.intersect || v.foot)
      .map((v) => v.label),
  );
}

/** 布局引擎：根据 diagramDescription 输出 label → 坐标映射 */
export function computeLayout(desc: DiagramDescription): VertexMap {
  const map = layoutPrimaryShape(desc);
  // 函数图的坐标全部由 curve-sampler 计算，不参与辅助点插值
  if (desc.shapeType !== "function-graph") {
    placeAuxiliaryVertices(desc, map);
    fitToCanvas(map);
  }
  return map;
}

/**
 * 整体等比缩放 + 居中，把算出来的所有点收进画布可用区。
 *
 * 为什么必须做：折叠题里像点会被镜像到矩形**外面**（矩形沿对角线折，
 * C 的像点落在图形左侧），按固定坐标算会跑到画布外被裁掉；
 * 圆图里圆周点也可能贴边导致顶点标签被弧线压住。
 * 等比缩放不改变角度、垂直关系与镜像关系，因此不会破坏任何几何约束。
 */
function fitToCanvas(map: VertexMap): void {
  if (map.size === 0) return;
  const points = [...map.values()];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;

  // 顶点标签画在点上方，顶部要额外留出「偏移 + 字号」的空间，否则标签会被切掉
  const padTop = LABEL_OFFSET + FONT_SIZE * 0.75;
  const padBottom = 12;
  const padX = MARGIN * 0.5;
  const availW = CANVAS_WIDTH - 2 * padX;
  const availH = CANVAS_HEIGHT - padTop - padBottom;

  let scale = 1;
  if (width > 0.01) scale = Math.min(scale, availW / width);
  if (height > 0.01) scale = Math.min(scale, availH / height);
  scale = Math.max(0.25, Math.min(1.6, scale));

  const offsetX = padX + (availW - width * scale) / 2 - minX * scale;
  const offsetY = padTop + (availH - height * scale) / 2 - minY * scale;
  for (const [label, point] of map) {
    map.set(label, { x: point.x * scale + offsetX, y: point.y * scale + offsetY });
  }
}

function layoutPrimaryShape(desc: DiagramDescription): VertexMap {
  switch (desc.shapeType) {
    case "single-triangle":
      return layoutSingleTriangle(desc);
    case "collinear-triangles":
      return layoutCollinearTriangles(desc);
    case "parallelogram":
      return layoutParallelogram(desc);
    case "rectangle":
      return layoutRectangle(desc);
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

/**
 * 放置辅助点：垂足、交点、中点、折叠像点等。
 * 用 `on: [起点, 终点]` 声明所在线段，按 ratio 线性插值得到坐标 —— 位置仍由程序确定，
 * 不需要 AI 提供像素坐标。ratio 允许略微超出 [0,1]，用于表达延长线上的点。
 */
function placeAuxiliaryVertices(desc: DiagramDescription, map: VertexMap): void {
  // 辅助点之间可能互相引用（如先求交点 E，再取 E 与 D 的中点 F），
  // 因此多轮迭代直到不再有新坐标产生。
  const pending = desc.vertices.filter((v) => v.on || v.reflect || v.intersect || v.foot);
  for (let pass = 0; pass <= pending.length; pass += 1) {
    let progressed = false;
    for (const vertex of pending) {
      if (map.has(vertex.label)) continue;

      if (vertex.intersect) {
        const [a1, a2, b1, b2] = vertex.intersect;
        const p1 = map.get(a1);
        const p2 = map.get(a2);
        const p3 = map.get(b1);
        const p4 = map.get(b2);
        if (!p1 || !p2 || !p3 || !p4) continue;
        const hit = intersectLines(p1, p2, p3, p4);
        if (!hit) continue;
        map.set(vertex.label, hit);
        progressed = true;
        continue;
      }

      if (vertex.foot) {
        const origin = map.get(vertex.foot.from);
        const onFrom = map.get(vertex.foot.to[0]);
        const onTo = map.get(vertex.foot.to[1]);
        if (!origin || !onFrom || !onTo) continue;
        const dx = onTo.x - onFrom.x;
        const dy = onTo.y - onFrom.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        // 垂足 = 起点在该直线上的投影
        const t = ((origin.x - onFrom.x) * dx + (origin.y - onFrom.y) * dy) / lenSq;
        map.set(vertex.label, { x: onFrom.x + dx * t, y: onFrom.y + dy * t });
        progressed = true;
        continue;
      }

      if (vertex.reflect) {
        const origin = map.get(vertex.reflect.of);
        const axisFrom = map.get(vertex.reflect.axis[0]);
        const axisTo = map.get(vertex.reflect.axis[1]);
        if (!origin || !axisFrom || !axisTo) continue;
        map.set(vertex.label, mirrorPoint(origin, axisFrom, axisTo));
        progressed = true;
        continue;
      }

      if (!vertex.on) continue;
      const from = map.get(vertex.on[0]);
      const to = map.get(vertex.on[1]);
      if (!from || !to) continue;
      const t = vertex.ratio ?? 0.5;
      map.set(vertex.label, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      progressed = true;
    }
    if (!progressed) break;
  }
}

/**
 * 两条直线的交点（线段按无限长直线处理，交点可落在线段延长处）。
 * 平行或退化时返回 null，交给上层跳过。
 */
function intersectLines(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + d1x * t, y: p1.y + d1y * t };
}

/**
 * 点 p 关于直线 (a,b) 的镜像点。
 * 折叠题里「点 C 落在点 C′ 处」就是这个运算——用 on+ratio 表达不了，
 * 只能沿折痕插值，会把像点放到错误的角落并与别的顶点标注重叠。
 */
function mirrorPoint(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return p;
  // p-a 在轴方向上的投影
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const foot = { x: a.x + dx * t, y: a.y + dy * t };
  // 像点 = 垂足 + (垂足 - 原点)
  return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y };
}

// ---------- 单三角形 ----------

function layoutSingleTriangle(desc: DiagramDescription): VertexMap {
  const vertices = primaryPolygon(desc);
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
    // 派生点（on / reflect / intersect / foot）的坐标由 placeAuxiliaryVertices 现算，
    // 这里只排主顶点，否则会被当成共线锚点先占位
    const derived = derivedLabels(desc);
    const anchors = collinearGroup.points.filter((label) => !derived.has(label));
    const points = anchors.length >= 2 ? anchors : collinearGroup.points;
    const n = points.length;
    const leftX = MARGIN;
    const rightX = CANVAS_WIDTH - MARGIN;
    const spacing = n > 1 ? (rightX - leftX) / (n - 1) : 0;
    points.forEach((label, i) => {
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
  const vertices = primaryPolygon(desc);
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

// ---------- 矩形 ----------

/**
 * 矩形：与平行四边形的唯一区别是**不施加倾斜量**，四个角保持直角。
 * 之前矩形只能用 parallelogram 表达，被统一 skew 25%，画出来是斜的，
 * 学生据此判断不了哪条边垂直于哪条边。
 */
function layoutRectangle(desc: DiagramDescription): VertexMap {
  const vertices = primaryPolygon(desc);
  if (vertices.length < 4) return new Map();
  const [a, b, c, d] = vertices;
  const result: VertexMap = new Map();

  // 题面给了两条邻边长就按真实比例画（矩形折叠题常见），否则用横版默认比例
  const widthLen = sideLength(desc, a, b) ?? sideLength(desc, c, d);
  const heightLen = sideLength(desc, b, c) ?? sideLength(desc, d, a);
  const ratio = widthLen && heightLen ? widthLen / heightLen : 1.5;

  const availW = CANVAS_WIDTH - 2 * MARGIN;
  const availH = TRI_HEIGHT;
  let w = availW;
  let h = w / ratio;
  if (h > availH) {
    h = availH;
    w = h * ratio;
  }

  const left = (CANVAS_WIDTH - w) / 2;
  const bottom = BASE_Y;
  // A(左下) B(右下) C(右上) D(左上)，四边严格水平/垂直
  result.set(a, { x: left, y: bottom });
  result.set(b, { x: left + w, y: bottom });
  result.set(c, { x: left + w, y: bottom - h });
  result.set(d, { x: left, y: bottom - h });
  return result;
}

// ---------- 圆 ----------

/**
 * 点 p 在线段 ab 上的投影参数 t（0=起点 a，1=终点 b）。
 * 返回 null 表示 a/b 缺坐标或线段退化，此时无法判断、不报违规。
 */
function segmentSpan(p: Point, a: Point | undefined, b: Point | undefined): number | null {
  if (!a || !b) return null;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq < 1e-9) return null;
  return ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
}

const SPAN_EPSILON = 1e-6;

/**
 * 出题前提校验：声明为「交点 / 垂足」的点必须真的落在线段上。
 *
 * 题目说「BC′ 与 AD 相交于点 E」，隐含 E 在两条**线段**上；变式改数据（如交换邻边）
 * 后交点只存在于延长线上，题设即失效——图会如实画出来（E 悬空），但题已经不可解。
 * 布局完成后逐点检查投影参数是否在 [0,1] 内，把这类矛盾在落库前暴露出来。
 */
export function diagramPremiseViolations(desc: DiagramDescription, map: VertexMap): string[] {
  const issues: string[] = [];
  for (const vertex of desc.vertices) {
    const point = map.get(vertex.label);
    if (!point) {
      // 声明了却没有坐标的顶点：渲染时会被静默跳过，相关的线段/标签全部消失。
      // 典型场景是模型用 single-triangle 装了两个三角形——第二个三角形的顶点无处安放。
      issues.push(`顶点 ${vertex.label} 没有算出坐标（图形结构装不下这个顶点）`);
      continue;
    }
    if (vertex.intersect) {
      const [a1, a2, b1, b2] = vertex.intersect;
      const t1 = segmentSpan(point, map.get(a1), map.get(a2));
      const t2 = segmentSpan(point, map.get(b1), map.get(b2));
      if (t1 === null || t2 === null) continue;
      if (t1 < -SPAN_EPSILON || t1 > 1 + SPAN_EPSILON || t2 < -SPAN_EPSILON || t2 > 1 + SPAN_EPSILON) {
        issues.push(
          `${vertex.label} 应为 ${a1}${a2} 与 ${b1}${b2} 的交点，但落在线段延长线上（t=${t1.toFixed(2)}/${t2.toFixed(2)}）`,
        );
      }
    }
    if (vertex.foot) {
      const t = segmentSpan(point, map.get(vertex.foot.to[0]), map.get(vertex.foot.to[1]));
      if (t === null) continue;
      if (t < -SPAN_EPSILON || t > 1 + SPAN_EPSILON) {
        issues.push(`${vertex.label} 应为 ${vertex.foot.to[0]}${vertex.foot.to[1]} 上的垂足，但落在线段外（t=${t.toFixed(2)}）`);
      }
    }
    if (vertex.on && vertex.ratio !== undefined && (vertex.ratio < -SPAN_EPSILON || vertex.ratio > 1 + SPAN_EPSILON)) {
      issues.push(`${vertex.label} 的 ratio=${vertex.ratio} 超出 [0,1]，点落在线段 ${vertex.on[0]}${vertex.on[1]} 之外`);
    }
  }
  return issues;
}

/**
 * 给 n 个自由圆周点分配角度（弧度，0..2π，屏幕坐标 y 向下）。
 *
 * 三条约束，缺一个图就会错或没法看：
 * 1. 必须落在 (π, 2π)，即圆的上半部分——直径两端已经在 π / 0 上占了位；
 * 2. 必须避开正上方 1.5π：圆顶点向水平直径作垂线时，垂足正好压在圆心 O 上，
 *    标签叠在一起，看着像那条垂线没画出来；
 * 3. 点与点之间要拉开距离（≥ step），否则垂足会跟直径端点 A/B 挤成一团。
 *
 * 做法是围绕 1.5π 左右交替外扩（±step, ±2step ...），天然避开正上方。
 */
function circlePointAngles(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.PI * 1.5;
  const maxK = Math.ceil(n / 2);
  // 0.42π 留出到 π / 2π 的安全边距，0.2π 是默认的点间距
  const step = Math.min(Math.PI * 0.2, (Math.PI * 0.42) / maxK);
  return Array.from({ length: n }, (_, i) => {
    const k = Math.floor(i / 2) + 1;
    return base + (i % 2 === 0 ? -k : k) * step;
  });
}

function layoutCircle(desc: DiagramDescription): VertexMap {
  const result: VertexMap = new Map();
  const circles = desc.circles;
  if (!circles || circles.length === 0) return result;
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.35;
  const centerLabel = circles[0].center;
  result.set(centerLabel, { x: cx, y: cy });

  // 直径：若某个共线组同时包含圆心与两个圆周点（如 A、O、B），
  // 则这两点必须落在过圆心的一条直线上且互为对径点——否则「AB 是直径」
  // 会被画成普通弦，直接误导「直径所对圆周角为直角」的推理。
  const diameterGroup = (desc.collinear ?? []).find(
    (group) => group.points.includes(centerLabel) && group.points.length >= 3,
  );
  const diameterEnds = diameterGroup
    ? diameterGroup.points.filter((label) => label !== centerLabel)
    : [];

  if (diameterEnds.length >= 2) {
    const [first, second] = diameterEnds;
    // 水平直径：左端在 π，右端在 0，其余圆周点排在上半圈（屏幕坐标 y 向下，π..2π 即上半）
    result.set(first, { x: cx - radius, y: cy });
    result.set(second, { x: cx + radius, y: cy });
    for (const label of diameterEnds.slice(2)) {
      // 超过两个端点按直径处理不了，退化为圆周点
      result.set(label, { x: cx + radius, y: cy - radius });
    }
  } else {
    // 半径端点（右侧）
    result.set(circles[0].radiusPoint, { x: cx + radius, y: cy });
  }

  // 其余圆周点：带 on / reflect / intersect / foot 的都是派生点，坐标必须由
  // placeAuxiliaryVertices 现算（垂足、镜像、交点），这里若先按圆周点占位，
  // 垂足会被顶到圆周上去（CD 画成水平线），必须统一排除。
  const placed = new Set(result.keys());
  const derived = derivedLabels(desc);
  const onCircle = desc.vertices
    .filter((v) => !derived.has(v.label) && !placed.has(v.label) && v.label !== centerLabel)
    .map((v) => v.label);
  const angles = circlePointAngles(onCircle.length);
  onCircle.forEach((label, i) => {
    const angle = angles[i];
    result.set(label, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });
  return result;
}

// ---------- 相交线 / 角 ----------

function layoutIntersectingLines(desc: DiagramDescription): VertexMap {
  const result: VertexMap = new Map();
  const collinearGroup = desc.collinear?.[0];
  if (!collinearGroup || collinearGroup.points.length < 2) return result;
  // 派生点（on / reflect / intersect / foot）的坐标交给 placeAuxiliaryVertices 插值，这里不能先占位
  const derived = derivedLabels(desc);
  const anchors = collinearGroup.points.filter((label) => !derived.has(label));
  const points = anchors.length >= 2 ? anchors : collinearGroup.points;
  const n = points.length;
  const leftX = MARGIN;
  const rightX = CANVAS_WIDTH - MARGIN;
  const spacing = n > 1 ? (rightX - leftX) / (n - 1) : 0;
  points.forEach((label, i) => {
    result.set(label, { x: leftX + i * spacing, y: BASE_Y });
  });
  // 非共线点（角的另一边）：从中间点向上延伸
  // 带 on 的是辅助点，坐标必须由 placeAuxiliaryVertices 插值，这里不能先占位
  const nonCollinear = desc.vertices
    .filter((v) => !derived.has(v.label) && !collinearGroup.points.includes(v.label))
    .map((v) => v.label);
  const midIndex = Math.floor(n / 2);
  const midPoint = result.get(points[midIndex]);
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

/** Checks *given* numeric angles in a model-written question against the
 * actual constructed vertices. A generic topological circle layout cannot
 * honor an arbitrary 125° constraint. Reject it instead of drawing a lie.
 */
export function diagramAngleClaimViolations(question:string,map:VertexMap):string[]{
 const issues:string[]=[];
 const pattern=/∠\s*([A-Z])\s*([A-Z])\s*([A-Z])\s*[=＝]\s*(\d+(?:\.\d+)?)\s*(?:°|度)/g;
 for(const match of question.matchAll(pattern)){
  const [,a,b,c,requested]=match;
  const A=map.get(a),B=map.get(b),C=map.get(c);
  if(!A||!B||!C){issues.push(`∠${a}${b}${c} 缺少顶点坐标`);continue;}
  const u={x:A.x-B.x,y:A.y-B.y},v={x:C.x-B.x,y:C.y-B.y};
  const denom=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
  if(denom<1e-8){issues.push(`∠${a}${b}${c} 退化`);continue;}
  const cosine=Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/denom));
  const measured=Math.acos(cosine)*180/Math.PI;
  if(Math.abs(measured-Number(requested))>1.5){
   issues.push(`∠${a}${b}${c} 声明 ${requested}°，实际绘制约 ${measured.toFixed(1)}°`);
  }
 }
 return issues;
}
