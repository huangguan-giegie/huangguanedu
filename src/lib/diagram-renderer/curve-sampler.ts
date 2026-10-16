/**
 * 函数曲线采样与分段。
 *
 * 解决两类问题：
 * 1) 反比例函数 y=1/x 在定义域跨越 x=0 时，原实现用单个 <polyline> 连接所有采样点，
 *    会在奇点处画出一条贯穿画布的竖直假线，把双曲线的两支错误连在一起（数学上严禁）。
 * 2) y 范围取全体采样点的 min/max 时，反比例在 [-5,5] 上 y 可达 ±20，
 *    会把双曲线压成贴着画布上下边缘的两条近乎水平的线。
 *
 * 设计：
 * - 三段判据切分曲线：非有限值硬断开 / 吸附到 0 暴露奇点 / 大跳变用二分细化确认
 * - 稳健 y 范围用 P2/P98 分位数，避免被渐近线极值污染
 * - 单条曲线解析失败不影响其他曲线与坐标轴（原实现会让整题变空白）
 */
import type { DiagramDescription } from "../diagram-description";
import { compileExpression, type CompiledExpression } from "./expression-parser";
import { CANVAS_HEIGHT, CANVAS_WIDTH, MARGIN } from "./constants";

export type Point = { x: number; y: number };

/** 数据空间的采样点 */
export interface SamplePoint {
  readonly x: number;
  readonly y: number;
}

export interface CurveSegment {
  /** 已换算到 SVG 坐标的点 */
  readonly points: Point[];
}

export interface FunctionCurveRender {
  readonly color: string;
  readonly segments: Point[][];
}

export interface FunctionGraphLayout {
  /** 坐标轴；即使所有曲线都解析失败也应为非 null */
  readonly axes: {
    readonly xStart: Point;
    readonly xEnd: Point;
    readonly yStart: Point;
    readonly yEnd: Point;
    readonly origin: Point;
  } | null;
  readonly curves: FunctionCurveRender[];
  /** keyPoints 的 SVG 坐标 */
  readonly keyPoints: Array<{ label: string; point: Point }>;
  /** 解析失败的表达式，供上层记日志（不再静默） */
  readonly errors: Array<{ expr: string; message: string }>;
  /** 数据范围，供绘制刻度使用 */
  readonly domain: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** 刻度（pos 为 SVG 坐标），供绘制坐标刻度使用 */
  readonly ticks: {
    readonly x: Array<{ value: number; pos: number }>;
    readonly y: Array<{ value: number; pos: number }>;
  };
}

/** y 绝对值上限：超过视为数值噪声/发散，当断点处理 */
const Y_ABS_LIMIT = 1e6;
/** 大跳变触发阈值相对稳健跨度的倍数 */
const JUMP_REL_FACTOR = 1.5;
/** 二分细化递归层数（防奇点偏心） */
const BISECT_DEPTH = 2;

/**
 * 采样并按不连续点切分。
 *
 * @returns 数据空间的分段点集，每段点数 >= 2
 */
export function sampleAndSegment(
  compiled: CompiledExpression,
  xMin: number,
  xMax: number,
  samples = 100,
): SamplePoint[][] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];

  const dx = (xMax - xMin) / samples;
  // 吸附阈值：让「极靠近 0 的 x」精确落到 0，使 1/0 暴露为 Infinity
  // （用累加生成 x 会得到 ~1e-15，此时 1/1e-15 是有限值，判据一失效）
  const epsX = Math.max(Math.abs(xMin), Math.abs(xMax)) * 1e-12;

  // 阶段 1：采样 + 吸附 + 有效性标记
  const raw: Array<{ x: number; y: number; valid: boolean }> = [];
  for (let i = 0; i <= samples; i += 1) {
    let x = xMin + (xMax - xMin) * (i / samples);
    if (Math.abs(x) < epsX) x = 0;
    // 域错误返回 NaN / ±Infinity，绝不抛异常
    const y = compiled.evaluate(x);
    const valid = Number.isFinite(y) && Math.abs(y) <= Y_ABS_LIMIT;
    raw.push({ x, y, valid });
  }

  // 阶段 2：稳健 y 跨度（分位数，避免被渐近线极值污染）
  const finiteYs = raw
    .filter((p) => p.valid)
    .map((p) => p.y)
    .sort((a, b) => a - b);
  const robustSpan =
    finiteYs.length >= 5
      ? quantile(finiteYs, 0.9) - quantile(finiteYs, 0.1)
      : finiteYs.length > 0
        ? finiteYs[finiteYs.length - 1] - finiteYs[0]
        : 0;
  const jumpTrigger = Math.max(JUMP_REL_FACTOR * robustSpan, 1e-9);

  // 阶段 3：逐点判定是否断开
  const breaks: boolean[] = new Array(raw.length - 1).fill(false);
  for (let i = 0; i < raw.length - 1; i += 1) {
    const a = raw[i];
    const b = raw[i + 1];

    // 判据 1/2：非有限值（含吸附后 1/0 = Infinity）
    if (!a.valid || !b.valid) {
      breaks[i] = true;
      continue;
    }

    // 判据 3：大跳变 → 二分细化确认，避免误杀陡而连续的曲线
    const delta = Math.abs(b.y - a.y);
    if (delta <= jumpTrigger && delta <= Y_ABS_LIMIT) continue;
    if (isDiscontinuous(compiled, a, b, BISECT_DEPTH)) breaks[i] = true;
  }

  // 阶段 4：切段
  const segments: SamplePoint[][] = [];
  let current: SamplePoint[] = [];
  const flush = (): void => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (let i = 0; i < raw.length; i += 1) {
    if (!raw[i].valid) {
      flush();
      continue;
    }
    current.push({ x: raw[i].x, y: raw[i].y });
    if (i < breaks.length && breaks[i]) flush();
  }
  flush();

  // 阶段 5：段端延伸（让双曲线画到画布外，而不是半空中断）
  for (const seg of segments) {
    if (seg.length === 0) continue;
    tryExtend(compiled, seg, seg[0], -1, dx);
    tryExtend(compiled, seg, seg[seg.length - 1], 1, dx);
  }

  return segments.filter((s) => s.length >= 2);
}

/** 二分细化：若两点之间存在奇点，中点值会比两端更极端 */
function isDiscontinuous(
  compiled: CompiledExpression,
  a: SamplePoint,
  b: SamplePoint,
  depth: number,
): boolean {
  const xm = (a.x + b.x) / 2;
  const ym = compiled.evaluate(xm);

  if (!Number.isFinite(ym) || Math.abs(ym) > Y_ABS_LIMIT) return true;

  const mid = (a.y + b.y) / 2;
  const halfSpan = Math.abs(b.y - a.y) / 2;
  if (Math.abs(ym - mid) > halfSpan) return true;

  if (depth > 0) {
    return (
      isDiscontinuous(compiled, a, { x: xm, y: ym }, depth - 1) ||
      isDiscontinuous(compiled, { x: xm, y: ym }, b, depth - 1)
    );
  }
  return false;
}

/** 向断点方向再取一个极限点，让曲线延伸到画布边缘 */
function tryExtend(
  compiled: CompiledExpression,
  seg: SamplePoint[],
  edge: SamplePoint,
  dir: -1 | 1,
  dx: number,
): void {
  const xe = edge.x + dir * dx * 1e-3;
  const ye = compiled.evaluate(xe);
  if (!Number.isFinite(ye) || Math.abs(ye) > Y_ABS_LIMIT) return;
  if (Math.abs(ye) <= Math.abs(edge.y)) return;
  if (dir === -1) seg.unshift({ x: xe, y: ye });
  else seg.push({ x: xe, y: ye });
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 计算函数图的完整布局：坐标轴 + 各曲线分段 + keyPoints。
 * 单条曲线解析失败只记录到 errors，不影响坐标轴与其他曲线。
 */
export function computeFunctionCurves(desc: DiagramDescription): FunctionGraphLayout {
  const errors: Array<{ expr: string; message: string }> = [];
  const functions = desc.functions ?? [];
  const keyPoints = desc.keyPoints ?? [];

  // 1. 编译所有表达式；失败的记入 errors 并跳过
  const compiledList: Array<{
    expr: string;
    domain: [number, number];
    color: string;
    compiled: CompiledExpression;
    segments: SamplePoint[][];
  }> = [];

  for (const fn of functions) {
    const domain = fn.domain ?? [-5, 5];
    const color = fn.color ?? "#39323f";
    try {
      const compiled = compileExpression(fn.expr);
      const segments = sampleAndSegment(compiled, domain[0], domain[1]);
      compiledList.push({ expr: fn.expr, domain, color, compiled, segments });
    } catch (error) {
      errors.push({
        expr: fn.expr,
        message: error instanceof Error ? error.message : "表达式解析失败",
      });
    }
  }

  // 2. 数据范围：x 用各定义域并集；y 用有限采样点的 P2/P98（避免被渐近线极值压扁）
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const item of compiledList) {
    xMin = Math.min(xMin, item.domain[0]);
    xMax = Math.max(xMax, item.domain[1]);
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    // 无有效曲线：退化到 keyPoints 推导，再不行用默认区间
    const xs = keyPoints.map((kp) => kp.x);
    xMin = xs.length > 0 ? Math.min(...xs) - 1 : -5;
    xMax = xs.length > 0 ? Math.max(...xs) + 1 : 5;
  }
  if (xMax - xMin < 1e-9) {
    xMin -= 1;
    xMax += 1;
  }
  // 将原点和题目关键点纳入绘图区，正定义域的曲线也能显示完整坐标轴。
  xMin = Math.min(xMin, 0, ...keyPoints.map((kp) => kp.x));
  xMax = Math.max(xMax, 0, ...keyPoints.map((kp) => kp.x));

  const allFiniteYs: number[] = [];
  for (const item of compiledList) {
    for (const seg of item.segments) {
      for (const p of seg) {
        if (Number.isFinite(p.y) && Math.abs(p.y) <= Y_ABS_LIMIT) allFiniteYs.push(p.y);
      }
    }
  }
  for (const kp of keyPoints) {
    if (Number.isFinite(kp.y)) allFiniteYs.push(kp.y);
  }
  allFiniteYs.sort((a, b) => a - b);

  let yMin: number;
  let yMax: number;
  if (allFiniteYs.length >= 5) {
    yMin = quantile(allFiniteYs, 0.02);
    yMax = quantile(allFiniteYs, 0.98);
    if (yMax - yMin < 1e-9) {
      yMin = allFiniteYs[0] - 1;
      yMax = allFiniteYs[allFiniteYs.length - 1] + 1;
    }
  } else if (allFiniteYs.length > 0) {
    yMin = allFiniteYs[0];
    yMax = allFiniteYs[allFiniteYs.length - 1];
    if (yMax - yMin < 1e-9) {
      yMin -= 1;
      yMax += 1;
    }
  } else {
    yMin = -5;
    yMax = 5;
  }
  // 把 0 纳入区间，保证 x 轴可见
  yMin = Math.min(yMin, 0, ...keyPoints.map((kp) => kp.y));
  yMax = Math.max(yMax, 0, ...keyPoints.map((kp) => kp.y));
  if (yMax - yMin < 1e-9) {
    yMin = -1;
    yMax = 1;
  }

  // 3. SVG 坐标换算
  const axisLeft = MARGIN;
  const axisRight = CANVAS_WIDTH - MARGIN;
  const axisTop = MARGIN + 10;
  const axisBottom = CANVAS_HEIGHT - MARGIN;
  const spanX = xMax - xMin;
  const spanY = yMax - yMin;

  const toSvg = (p: SamplePoint): Point => ({
    x: axisLeft + ((p.x - xMin) / spanX) * (axisRight - axisLeft),
    y: axisBottom - ((p.y - yMin) / spanY) * (axisBottom - axisTop),
  });

  const axisMidX = axisLeft + ((0 - xMin) / spanX) * (axisRight - axisLeft);
  const axisMidY = axisBottom - ((0 - yMin) / spanY) * (axisBottom - axisTop);

  const axes = {
    xStart: { x: axisLeft - 10, y: axisMidY },
    xEnd: { x: axisRight + 10, y: axisMidY },
    yStart: { x: axisMidX, y: axisBottom + 10 },
    yEnd: { x: axisMidX, y: axisTop - 10 },
    origin: { x: axisMidX, y: axisMidY },
  };

  const curves: FunctionCurveRender[] = compiledList.map((item) => ({
    color: item.color,
    segments: item.segments.map((seg) => seg.map(toSvg)),
  }));

  const layoutKeyPoints = keyPoints.map((kp) => ({
    label: kp.label,
    point: toSvg({ x: kp.x, y: kp.y }),
  }));

  // 4. 刻度（跳过 0，原点已单独标注 O）
  const xTicks = computeTicks(xMin, xMax)
    .filter((v) => Math.abs(v) > 1e-9)
    .map((v) => ({
      value: v,
      pos: axisLeft + ((v - xMin) / spanX) * (axisRight - axisLeft),
    }));
  const yTicks = computeTicks(yMin, yMax)
    .filter((v) => Math.abs(v) > 1e-9)
    .map((v) => ({
      value: v,
      pos: axisBottom - ((v - yMin) / spanY) * (axisBottom - axisTop),
    }));

  return {
    axes,
    curves,
    keyPoints: layoutKeyPoints,
    errors,
    domain: { xMin, xMax, yMin, yMax },
    ticks: { x: xTicks, y: yTicks },
  };
}

/** 生成整数刻度（供 P2 坐标轴刻度使用） */
export function computeTicks(min: number, max: number, targetCount = 8): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const rawStep = (max - min) / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;

  const ticks: number[] = [];
  const first = Math.ceil(min / step) * step;
  for (let v = first; v <= max + step * 1e-9; v += step) {
    // 消除浮点误差（0.30000000000000004 → 0.3）
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(10)));
  }
  return ticks;
}
