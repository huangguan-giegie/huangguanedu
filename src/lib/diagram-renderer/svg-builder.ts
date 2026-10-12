/**
 * SVG 生成器：根据顶点坐标映射，确定性构建 SVG 字符串。
 * 所有 polygon 使用圆头端点（stroke-linecap/linejoin=round）。
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, STROKE_COLOR, STROKE_WIDTH, FONT_SIZE, LABEL_OFFSET, FILL_COLOR_LIGHT, MARGIN } from "./constants";
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
  extraLines?: Array<{ from: string; to: string }>;
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

  // 4. 额外线段（非共线的边）
  if (options?.extraLines) {
    for (const { from, to } of options.extraLines) {
      const p1 = vertexMap.get(from);
      const p2 = vertexMap.get(to);
      if (p1 && p2) {
        parts.push(line(p1, p2));
      }
    }
  }

  // 5. 等号刻度标注
  if (options?.marks) {
    for (const mark of options.marks) {
      if (mark.type === "equal-tick") {
        const p1 = vertexMap.get(mark.between[0]);
        const p2 = vertexMap.get(mark.between[1]);
        if (p1 && p2) parts.push(equalTicks(p1, p2, mark.count));
      } else {
        const vertex = vertexMap.get(mark.at);
        const neighbors = options.polygons?.flatMap((poly) => {
          const index = poly.vertices.indexOf(mark.at);
          if (index < 0 || poly.vertices.length < 3) return [];
          return [poly.vertices[(index + poly.vertices.length - 1) % poly.vertices.length], poly.vertices[(index + 1) % poly.vertices.length]];
        }).map((label) => vertexMap.get(label)).filter(Boolean) as Point[] | undefined;
        if (vertex && neighbors && neighbors.length >= 2) parts.push(rightAngle(vertex, neighbors[0], neighbors[1]));
      }
    }
  }

  // 6. 所有顶点标签
  for (const [label, pt] of vertexMap) {
    parts.push(vertexLabel(label, pt));
  }

  parts.push("</svg>");
  return parts.join("");
}

// ---------- SVG 元素 ----------

function line(a: Point, b: Point): string {
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round"/>`;
}

function polygon(points: Point[], fill: string): string {
  const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
  return `<polygon points="${pts}" fill="${fill}" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function vertexLabel(label: string, pt: Point): string {
  return `<text x="${pt.x}" y="${pt.y - LABEL_OFFSET}" font-size="${FONT_SIZE}" fill="${STROKE_COLOR}" text-anchor="middle" dominant-baseline="auto">${escapeXml(label)}</text>`;
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

/** 在顶点内侧绘制小直角框。 */
function rightAngle(vertex: Point, first: Point, second: Point): string {
  const size = 14;
  const firstLength = Math.sqrt((first.x - vertex.x) ** 2 + (first.y - vertex.y) ** 2) || 1;
  const secondLength = Math.sqrt((second.x - vertex.x) ** 2 + (second.y - vertex.y) ** 2) || 1;
  const a = { x: vertex.x + (first.x - vertex.x) / firstLength * size, y: vertex.y + (first.y - vertex.y) / firstLength * size };
  const b = { x: a.x + (second.x - vertex.x) / secondLength * size, y: a.y + (second.y - vertex.y) / secondLength * size };
  const c = { x: vertex.x + (second.x - vertex.x) / secondLength * size, y: vertex.y + (second.y - vertex.y) / secondLength * size };
  return `<polyline points="${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH / 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
