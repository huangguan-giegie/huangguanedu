/**
 * SVG 生成器：根据顶点坐标映射，确定性构建 SVG 字符串。
 * 所有 polygon 使用圆头端点（stroke-linecap/linejoin=round）。
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, STROKE_COLOR, STROKE_WIDTH, FONT_SIZE, LABEL_OFFSET, PRIME_FONT_SIZE, PRIME_RISE, FILL_COLOR_LIGHT, MARGIN } from "./constants";
import type { Point } from "./layout-engine";

/** 坐标轴刻度（value 为数据值，pos 为该轴方向上的 SVG 坐标） */
export interface AxisTick {
  readonly value: number;
  readonly pos: number;
}

/** 生成完整的 SVG 字符串 */
export function buildSvg(vertexMap: Map<string, Point>, options?: {
  polygons?: Array<{ vertices: string[] }>;
  circles?: Array<{ center: string; radiusPoint: string }>;
  collinearBase?: string[];
  marks?: Array<{ type: "equal-tick"; between: [string, string]; count: number } | { type: "right-angle"; at: string }>;
  extraLines?: Array<{ from: string; to: string; dashed?: boolean }>;
  /** 辅助点（垂足、交点、折叠像点等）：除标签外额外画一个实心点 */
  auxiliaryLabels?: string[];
  functionAxes?: { xStart: Point; xEnd: Point; yStart: Point; yEnd: Point; origin: Point };
  /** 每条曲线可能有多段（在不连续点处切分，如反比例函数的两支） */
  curves?: Array<{ segments: Point[][]; color: string }>;
  /** 坐标轴刻度 */
  ticks?: { x: AxisTick[]; y: AxisTick[] };
  /** 多函数图例 */
  legend?: Array<{ text: string; color: string }>;
}): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">`);
  parts.push(`<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#ffffff"/>`);

  // 0. 函数图坐标轴 + 刻度 + 曲线（在最底层）
  if (options?.functionAxes) {
    const a = options.functionAxes;
    // x 轴
    parts.push(line(a.xStart, a.xEnd));
    // x 轴箭头
    parts.push(`<polygon points="${a.xEnd.x},${a.xEnd.y - 4} ${a.xEnd.x},${a.xEnd.y + 4} ${a.xEnd.x + 8},${a.xEnd.y}" fill="${STROKE_COLOR}"/>`);
    // y 轴
    parts.push(line(a.yStart, a.yEnd));
    // y 轴箭头
    parts.push(`<polygon points="${a.yEnd.x - 4},${a.yEnd.y} ${a.yEnd.x + 4},${a.yEnd.y} ${a.yEnd.x},${a.yEnd.y - 8}" fill="${STROKE_COLOR}"/>`);
    // 原点标注
    parts.push(`<text x="${a.origin.x - 12}" y="${a.origin.y + 16}" font-size="14" fill="${STROKE_COLOR}">O</text>`);
    // 轴名称
    parts.push(`<text x="${a.xEnd.x + 4}" y="${a.xEnd.y - 6}" font-size="14" fill="${STROKE_COLOR}">x</text>`);
    parts.push(`<text x="${a.yEnd.x + 6}" y="${a.yEnd.y + 4}" font-size="14" fill="${STROKE_COLOR}">y</text>`);

    // 刻度（跳过 0，原点已标 O）
    if (options.ticks) {
      for (const tick of options.ticks.x) {
        parts.push(
          `<line x1="${tick.pos.toFixed(2)}" y1="${a.origin.y - 3}" x2="${tick.pos.toFixed(2)}" y2="${a.origin.y + 3}" stroke="${STROKE_COLOR}" stroke-width="1.5"/>`,
        );
        parts.push(
          `<text x="${tick.pos.toFixed(2)}" y="${a.origin.y + 18}" font-size="11" fill="${STROKE_COLOR}" text-anchor="middle">${formatTick(tick.value)}</text>`,
        );
      }
      for (const tick of options.ticks.y) {
        parts.push(
          `<line x1="${a.origin.x - 3}" y1="${tick.pos.toFixed(2)}" x2="${a.origin.x + 3}" y2="${tick.pos.toFixed(2)}" stroke="${STROKE_COLOR}" stroke-width="1.5"/>`,
        );
        parts.push(
          `<text x="${a.origin.x - 6}" y="${(tick.pos + 4).toFixed(2)}" font-size="11" fill="${STROKE_COLOR}" text-anchor="end">${formatTick(tick.value)}</text>`,
        );
      }
    }
  }

  // 曲线：每条曲线按不连续点切成多段，避免画出跨渐近线的假连线
  if (options?.curves) {
    for (const curve of options.curves) {
      for (const seg of curve.segments) {
        if (seg.length < 2) continue;
        const pts = seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
        parts.push(`<polyline points="${pts}" fill="none" stroke="${curve.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
  }

  // 多函数图例（右上角）
  if (options?.legend && options.legend.length > 1) {
    let ly = MARGIN - 14;
    for (const item of options.legend) {
      parts.push(`<line x1="${CANVAS_WIDTH - MARGIN - 60}" y1="${ly}" x2="${CANVAS_WIDTH - MARGIN - 44}" y2="${ly}" stroke="${item.color}" stroke-width="2.5" stroke-linecap="round"/>`);
      parts.push(`<text x="${CANVAS_WIDTH - MARGIN - 40}" y="${ly + 4}" font-size="12" fill="${STROKE_COLOR}">${escapeXml(item.text)}</text>`);
      ly += 18;
    }
  }

  // 1. 共线底边（一条连续直线）
  if (options?.collinearBase && options.collinearBase.length >= 2) {
    const points = options.collinearBase.map((label) => vertexMap.get(label)).filter(Boolean) as Point[];
    const first = points[0];
    const last = points[points.length - 1];
    parts.push(line(first, last));
  }

  // 2. 多边形
  if (options?.polygons) {
    for (const poly of options.polygons) {
      const points = poly.vertices.map((label) => vertexMap.get(label)).filter(Boolean) as Point[];
      if (points.length >= 3) {
        parts.push(polygon(points, FILL_COLOR_LIGHT));
      }
    }
  }

  // 3. 圆
  if (options?.circles) {
    for (const circle of options.circles) {
      const center = vertexMap.get(circle.center);
      const edge = vertexMap.get(circle.radiusPoint);
      if (center && edge) {
        const radius = Math.sqrt((center.x - edge.x) ** 2 + (center.y - edge.y) ** 2);
        parts.push(`<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>`);
      }
    }
  }

  // 4. 额外线段（辅助线与非共线的边）
  if (options?.extraLines) {
    for (const { from, to, dashed } of options.extraLines) {
      const p1 = vertexMap.get(from);
      const p2 = vertexMap.get(to);
      if (p1 && p2) {
        parts.push(dashed ? dashedLine(p1, p2) : line(p1, p2));
      }
    }
  }

  // 5. 等号刻度 / 直角标注
  const rightAngleRects: Rect[] = [];
  if (options?.marks) {
    for (const mark of options.marks) {
      if (mark.type === "equal-tick") {
        const p1 = vertexMap.get(mark.between[0]);
        const p2 = vertexMap.get(mark.between[1]);
        if (p1 && p2) parts.push(equalTicks(p1, p2, mark.count));
      } else {
        const vertex = vertexMap.get(mark.at);
        const neighbors = rightAngleNeighbors(mark.at, vertexMap, options);
        if (vertex && neighbors) {
          const box = rightAngleBox(vertex, neighbors[0], neighbors[1]);
          parts.push(box.svg);
          rightAngleRects.push(box.rect);
        }
      }
    }
  }

  // 6. 辅助点画实心小圆点，让「垂足/交点」这类点在图上可见
  if (options?.auxiliaryLabels?.length) {
    for (const label of options.auxiliaryLabels) {
      const pt = vertexMap.get(label);
      if (pt) parts.push(`<circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="${STROKE_COLOR}"/>`);
    }
  }

  // 7. 所有顶点标签（先算互不重叠、也不压线的位置，再渲染）
  const drawnEdges = collectDrawnEdges(vertexMap, options);
  for (const [label, pt] of layoutLabels(vertexMap, { edges: drawnEdges, obstacles: rightAngleRects })) {
    parts.push(vertexLabel(label, pt));
  }

  parts.push("</svg>");
  return parts.join("");
}

// ---------- SVG 元素 ----------

function line(a: Point, b: Point): string {
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>`;
}

/** 虚线：供折痕、辅助线使用 */
function dashedLine(a: Point, b: Point): string {
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-dasharray="8 6"/>`;
}

function polygon(points: Point[], fill: string): string {
  const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * 计算每个顶点标签的落位，避免互相压字、也避免压在线上。
 *
 * 背景：折叠题里像点 C′ 与顶点 A 的距离可能很近，两个标签会挤成一团，
 * 学生分不清哪个是哪个；圆图的顶点标签还会被圆弧压住；垂足 D 默认被放在
 * 正上方，正好落在竖线 CD 上，字母和线叠在一起。
 * 策略：默认把标签放在顶点正上方，冲突时依次试探后续候选位，
 * 要求既不撞已有标签、也不压线段中段、也不落进直角框里、且不出画布。
 */
const LABEL_CANDIDATE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -LABEL_OFFSET],
  [-LABEL_OFFSET, -LABEL_OFFSET * 0.8],
  [LABEL_OFFSET, -LABEL_OFFSET * 0.8],
  // 前后两个「斜上方更远」的位置：顶点正上方被线段占用时（如垂足）用得上
  [-LABEL_OFFSET, -LABEL_OFFSET * 1.3],
  [LABEL_OFFSET, -LABEL_OFFSET * 1.3],
  [0, LABEL_OFFSET * 1.5],
  [-LABEL_OFFSET * 1.4, 0],
  [LABEL_OFFSET * 1.4, 0],
];

/** 标签中心到线段中段的最小净空，小于它就认为压线了 */
const LABEL_CLEARANCE = FONT_SIZE * 0.7;

function layoutLabels(
  vertexMap: Map<string, Point>,
  avoid?: { edges?: Array<[Point, Point]>; obstacles?: Rect[] },
): Map<string, Point> {
  const placed: Point[] = [];
  const result = new Map<string, Point>();
  // 单个顶点附近的最小间距：字号 18，两个字符宽约 22，行高约 20
  const minDx = FONT_SIZE * 1.25;
  const minDy = FONT_SIZE * 1.1;
  const edges = avoid?.edges ?? [];
  const obstacles = avoid?.obstacles ?? [];

  const hitsDrawing = (candidate: Point): boolean => {
    for (const rect of obstacles) {
      if (
        candidate.x > rect.left - 2 && candidate.x < rect.right + 2 &&
        candidate.y > rect.top - 2 && candidate.y < rect.bottom + 2
      ) {
        return true;
      }
    }
    return edges.some(([a, b]) => distanceToSegmentInterior(candidate, a, b) < LABEL_CLEARANCE);
  };

  for (const [label, vertex] of vertexMap) {
    let chosen: Point = { x: vertex.x, y: vertex.y - LABEL_OFFSET };
    for (const [dx, dy] of LABEL_CANDIDATE_OFFSETS) {
      const candidate = {
        x: clamp(vertex.x + dx, MARGIN * 0.4, CANVAS_WIDTH - MARGIN * 0.4),
        y: clamp(vertex.y + dy, FONT_SIZE, CANVAS_HEIGHT - 6),
      };
      const collides = placed.some(
        (p) => Math.abs(p.x - candidate.x) < minDx && Math.abs(p.y - candidate.y) < minDy,
      );
      if (!collides && !hitsDrawing(candidate)) {
        chosen = candidate;
        break;
      }
    }
    placed.push(chosen);
    result.set(label, chosen);
  }
  return result;
}

/**
 * 点到线段「中段」的距离。
 *
 * 只有当投影落在线段内部（0 < t < 1）时才返回真实距离；落在两端以外一律返回
 * Infinity —— 标签天生紧贴自己所属的顶点，而经过该顶点的线也从旁边穿过去，
 * 若不做这个区分，任何位置都会被判成压线，一个候选都选不出来。
 */
function distanceToSegmentInterior(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq < 1e-6) return Infinity;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
  if (t <= 0 || t >= 1) return Infinity;
  return Math.abs(abx * (a.y - p.y) - (a.x - p.x) * aby) / Math.sqrt(lengthSq);
}

/** 收集图上真正画出来的线段，供标签避让使用 */
function collectDrawnEdges(
  vertexMap: Map<string, Point>,
  options?: {
    polygons?: Array<{ vertices: string[] }>;
    collinearBase?: string[];
    extraLines?: Array<{ from: string; to: string }>;
  },
): Array<[Point, Point]> {
  const edges: Array<[Point, Point]> = [];
  const base = options?.collinearBase;
  // 共线底边是按「首点 → 末点」一条直线画出来的
  if (base && base.length >= 2) {
    const first = vertexMap.get(base[0]);
    const last = vertexMap.get(base[base.length - 1]);
    if (first && last) edges.push([first, last]);
  }
  for (const poly of options?.polygons ?? []) {
    const points = poly.vertices.map((label) => vertexMap.get(label)).filter(Boolean) as Point[];
    for (let i = 0; i < points.length; i++) {
      edges.push([points[i], points[(i + 1) % points.length]]);
    }
  }
  for (const { from, to } of options?.extraLines ?? []) {
    const p1 = vertexMap.get(from);
    const p2 = vertexMap.get(to);
    if (p1 && p2) edges.push([p1, p2]);
  }
  return edges;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 顶点标签。像 C′（折叠像点）这种带撇的标签要单独处理：
 * U+2032 在渲染字体里会掉到基线上、看起来像逗号，必须用小号字 + dy 抬成上标，
 * 否则学生分不清 C 和 C′。
 */
function vertexLabel(label: string, pt: Point): string {
  const match = /^(.*?)([′']+)$/u.exec(label);
  const base = match ? match[1] : label;
  const primes = match ? match[2].length : 0;
  const body = primes
    ? `${escapeXml(base)}<tspan dy="${-PRIME_RISE}" font-size="${PRIME_FONT_SIZE}">${"'".repeat(primes)}</tspan>`
    : escapeXml(label);
  return `<text x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" font-size="${FONT_SIZE}" fill="${STROKE_COLOR}" text-anchor="middle" dominant-baseline="auto">${body}</text>`;
}

/** 刻度数值格式化：整数直接显示，小数最多 2 位并去除尾随 0 */
function formatTick(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

/** XML 文本转义，避免标签文本破坏 SVG 结构 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 在线段中点画等号刻度（短竖线，垂直于线段） */
function equalTicks(p1: Point, p2: Point, count: number): string {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // 垂直方向
  const nx = -dy / len;
  const ny = dx / len;
  const tickLen = 6;
  const tickGap = 4;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * tickGap;
    const cx = mx + (dx / len) * offset;
    const cy = my + (dy / len) * offset;
    parts.push(`<line x1="${cx - nx * tickLen}" y1="${cy - ny * tickLen}" x2="${cx + nx * tickLen}" y2="${cy + ny * tickLen}" stroke="${STROKE_COLOR}" stroke-width="2" stroke-linecap="round"/>`);
  }
  return parts.join("");
}

/**
 * 找出直角标记要用到的两条邻边方向。
 *
 * 优先看线段（含辅助线）：垂足、交点这类辅助点不在任何多边形里，
 * 原实现只查 polygons，导致「CD⊥AB 于点 D」的直角小方框被静默丢弃——
 * 图上看不出哪里是直角，而直角正是这道题的解题关键。
 */
function rightAngleNeighbors(
  label: string,
  vertexMap: Map<string, Point>,
  options: {
    polygons?: Array<{ vertices: string[] }>;
    extraLines?: Array<{ from: string; to: string }>;
    collinearBase?: string[];
  },
): [Point, Point] | null {
  const vertex = vertexMap.get(label);
  if (!vertex) return null;

  // 1. 经过该点的显式线段（辅助线优先，垂足/交点都在这里）
  const lineEnds: Point[] = [];
  for (const line of options.extraLines ?? []) {
    const other = line.from === label ? line.to : line.to === label ? line.from : null;
    const point = other ? vertexMap.get(other) : undefined;
    if (point) lineEnds.push(point);
  }
  // 2. 共线底边：该点位于底边上时，底边两个远端方向也算（如垂足 D 在 AB 上）
  if (options.collinearBase?.includes(label)) {
    const ends = [options.collinearBase[0], options.collinearBase[options.collinearBase.length - 1]]
      .map((end) => (end === label ? undefined : vertexMap.get(end)))
      .filter(Boolean) as Point[];
    lineEnds.push(...ends);
  }
  // 3. 多边形相邻顶点兜底
  for (const poly of options.polygons ?? []) {
    const index = poly.vertices.indexOf(label);
    if (index < 0 || poly.vertices.length < 3) continue;
    for (const neighbour of [
      poly.vertices[(index + poly.vertices.length - 1) % poly.vertices.length],
      poly.vertices[(index + 1) % poly.vertices.length],
    ]) {
      const point = vertexMap.get(neighbour);
      if (point) lineEnds.push(point);
    }
  }

  // 4. 几何兜底：该顶点落在某条已画直线的**中间**时，这条线的两端也构成两个方向。
  //    「CD⊥AB 于点 D」里的垂足 D 就是这种情况——D 不在 collinearBase（那是 A、O、B）里，
  //    也不是任何多边形的顶点，光靠上面三步只找得到 C 一个方向，于是被静默丢弃、
  //    图上根本没有直角标记。而直角恰恰是这类题的解题关键。
  const others = Array.from(vertexMap.entries()).filter(([other]) => other !== label);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      if (isPointOnSegment(vertex, others[i][1], others[j][1])) {
        lineEnds.push(others[i][1], others[j][1]);
      }
    }
  }

  const unique = lineEnds.filter(
    (p, i) => lineEnds.findIndex((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) === i,
  );
  return unique.length >= 2 ? [unique[0], unique[1]] : null;
}

/**
 * 点 p 是否落在（不包含两端点的）线段 ab 上。
 * 容差 1.5px，足以吸收浮点误差，又不会把「离得近」误判成「在上面」。
 */
function isPointOnSegment(p: Point, a: Point, b: Point, tolerance = 1.5): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = Math.hypot(abx, aby);
  if (length < 1e-6) return false;
  // 点到直线 ab 的距离
  const distance = Math.abs(abx * (a.y - p.y) - (a.x - p.x) * aby) / length;
  if (distance > tolerance) return false;
  // 投影参数必须严格在两端点之间，否则 p 就是端点本身
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (length * length);
  return t > 0.02 && t < 0.98;
}

/** 直角框占据的矩形区域（标签避让用） */
interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 在顶点内侧绘制小直角框，同时返回它占的矩形。 */
function rightAngleBox(vertex: Point, first: Point, second: Point): { svg: string; rect: Rect } {
  const size = 14;
  const firstLength = Math.sqrt((first.x - vertex.x) ** 2 + (first.y - vertex.y) ** 2) || 1;
  const secondLength = Math.sqrt((second.x - vertex.x) ** 2 + (second.y - vertex.y) ** 2) || 1;
  const a = { x: vertex.x + (first.x - vertex.x) / firstLength * size, y: vertex.y + (first.y - vertex.y) / firstLength * size };
  const b = { x: a.x + (second.x - vertex.x) / secondLength * size, y: a.y + (second.y - vertex.y) / secondLength * size };
  const c = { x: vertex.x + (second.x - vertex.x) / secondLength * size, y: vertex.y + (second.y - vertex.y) / secondLength * size };
  const svg = `<polyline points="${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH / 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return {
    svg,
    rect: {
      left: Math.min(vertex.x, a.x, b.x, c.x),
      top: Math.min(vertex.y, a.y, b.y, c.y),
      right: Math.max(vertex.x, a.x, b.x, c.x),
      bottom: Math.max(vertex.y, a.y, b.y, c.y),
    },
  };
}
