/**
 * Certified, bounded exam-authoring examples. The solver is deliberately
 * restricted to three algebraically complete families; it never estimates
 * a global solution count from random samples or a Jacobian rank alone.
 * AI and arbitrary user expressions are not trusted as answer sources.
 */
export type ConstraintScenario = "circle" | "parabola" | "triangle";
export type PointTarget = "point" | "square";
export type Point2 = { x: number; y: number };

export interface CircleConstraints {
  radius: number;
  y: number;
  lockY: boolean;
  positiveX: boolean;
  target: PointTarget;
}
export interface ParabolaConstraints {
  p: number;
  x: number;
  lockX: boolean;
  positiveY: boolean;
  target: PointTarget;
}
export interface TriangleConstraints {
  base: number;
  height: number;
  x: number;
  lockHeight: boolean;
  lockX: boolean;
}
export interface CertifiedQuestion {
  question: string;
  answer: string;
  explanation: string;
  level: "中考" | "高考";
}
export type SolutionStatus = "continuous" | "none" | "unique" | "multiple";
export interface ConstraintAnalysis {
  status: SolutionStatus;
  /** null means no feasible object; otherwise intrinsic degrees of freedom. */
  degreesOfFreedom: number | null;
  /** Coordinates are exhaustive ONLY when the solution set is discrete. */
  points: Point2[];
  targetUnique: boolean;
  targetValue: string | null;
  conditions: string[];
  notes: string[];
  question: CertifiedQuestion | null;
}
const TOLERANCE = 1e-10;

function boundedInteger(value: number, name: string, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name}必须是 ${min} 至 ${max} 的整数`);
  }
}
function radical(n: number): string {
  const root = Math.sqrt(n);
  return Number.isInteger(root) ? String(root) : `√${n}`;
}
function solutionState(points: Point2[]): SolutionStatus {
  return points.length === 0 ? "none" : points.length === 1 ? "unique" : "multiple";
}
function candidateRoots(value: number, positiveOnly: boolean): number[] {
  if (value < 0) return [];
  if (value === 0) return positiveOnly ? [] : [0];
  const root = Math.sqrt(value);
  return positiveOnly ? [root] : [-root, root];
}

export function analyzeCircle(c: CircleConstraints): ConstraintAnalysis {
  boundedInteger(c.radius, "半径", 1, 6);
  boundedInteger(c.y, "纵坐标", -7, 7);
  const radiusSquared = c.radius ** 2;
  const square = radiusSquared - c.y ** 2;
  const conditions = [`P 在圆 x²+y²=${radiusSquared} 上`];
  if (c.lockY) conditions.push(`y=${c.y}`);
  if (c.positiveX) conditions.push("x>0");
  if (!c.lockY) return {
    status: "continuous", degreesOfFreedom: 1, points: [],
    targetUnique: false, targetValue: null, conditions, question: null,
    notes: ["圆提供一条一维轨迹；符号不等式只能筛选圆弧，不能单独确定点。"],
  };
  const roots = candidateRoots(square, c.positiveX);
  const points = roots.map(x => ({ x, y: c.y }));
  const status = solutionState(points);
  const targetUnique = status !== "none" && (c.target === "square" || status === "unique");
  const targetValue = !targetUnique ? null : c.target === "square"
    ? String(square) : `P(${roots[0] < -TOLERANCE ? "-" : ""}${radical(square)}, ${c.y})`;
  const explanation = `由 x²+y²=${radiusSquared}，代入 y=${c.y}，得 x²=${radiusSquared}−(${c.y})²=${square}。`
    + (square < 0 ? "右边为负数，无实数解。" : square === 0 ? "因此 x=0。" : `因此 x=±${radical(square)}。`)
    + (c.positiveX ? "结合 x>0，保留正根（若仅有零根则无解）。" : "");
  const question = targetUnique ? {
    level: "中考" as const,
    question: `在平面直角坐标系中，P(x,y) 在圆 x²+y²=${radiusSquared} 上，已知 y=${c.y}${c.positiveX ? "，且 x>0" : ""}。求${c.target === "square" ? "x² 的值" : "点 P 的坐标"}。`,
    answer: targetValue!,
    explanation: `${explanation}所以${c.target === "square" ? `x²=${square}` : targetValue}。`,
  } : null;
  const notes = [explanation];
  if (square === 0 && !c.positiveX) notes.push("直线与圆相切，两个交点合并为一个。");
  if (c.target === "square" && c.positiveX && targetUnique) notes.push("对于目标 x²，条件 x>0 并非必要：两个对称解的平方相同。");
  if (status === "multiple" && c.target === "point") notes.push("点的坐标仍有两个解；请加入 x>0 等分支条件。");
  return {status, degreesOfFreedom:status==="none"?null:0, points, targetUnique, targetValue, conditions, notes, question};
}

export function analyzeParabola(c: ParabolaConstraints): ConstraintAnalysis {
  boundedInteger(c.p, "焦点参数", 1, 3);
  boundedInteger(c.x, "横坐标", -4, 9);
  const scale = 4 * c.p;
  const square = scale * c.x;
  const conditions = [`P 在抛物线 y²=${scale}x 上`];
  if (c.lockX) conditions.push(`x=${c.x}`);
  if (c.positiveY) conditions.push("y>0");
  if (!c.lockX) return {
    status: "continuous", degreesOfFreedom: 1, points: [],
    targetUnique: false, targetValue: null, conditions, question: null,
    notes: ["抛物线是连续轨迹；仅限制 y 的正负不能唯一确定点。"],
  };
  const roots = candidateRoots(square, c.positiveY);
  const points = roots.map(y => ({ x: c.x, y }));
  const status = solutionState(points);
  const targetUnique = status !== "none" && (c.target === "square" || status === "unique");
  const targetValue = !targetUnique ? null : c.target === "square"
    ? String(square) : `P(${c.x}, ${roots[0] < -TOLERANCE ? "-" : ""}${radical(square)})`;
  const explanation = `把 x=${c.x} 代入 y²=${scale}x，得到 y²=${square}。`
    + (square < 0 ? "故不存在实数点。" : square === 0 ? "因此 y=0。" : `于是 y=±${radical(square)}。`)
    + (c.positiveY ? "由 y>0 取正根（零根不满足）。" : "");
  const question = targetUnique ? {
    level: "高考" as const,
    question: `已知 P(x,y) 在抛物线 y²=${scale}x 上，且 x=${c.x}${c.positiveY ? "，y>0" : ""}。求${c.target === "square" ? "y² 的值" : "点 P 的坐标"}。`,
    answer: targetValue!,
    explanation: `${explanation}所以${c.target === "square" ? `y²=${square}` : targetValue}。`,
  } : null;
  const notes = [explanation];
  if (c.target === "square" && c.positiveY && targetUnique) notes.push("目标 y² 已唯一确定，附加的 y>0 是非必要条件。");
  if (status === "multiple" && c.target === "point") notes.push("一条竖直线与抛物线有两个交点，需要指定上下分支。");
  return {status, degreesOfFreedom:status==="none"?null:0, points, targetUnique, targetValue, conditions, notes, question};
}

export function analyzeTriangle(c: TriangleConstraints): ConstraintAnalysis {
  boundedInteger(c.base, "底边", 2, 9);
  boundedInteger(c.height, "高", 1, 7);
  boundedInteger(c.x, "顶点横坐标", -5, 8);
  const degreesOfFreedom = Number(!c.lockHeight) + Number(!c.lockX);
  const area = c.base * c.height / 2;
  const conditions = [`A(0,0)，B(${c.base},0)，C 在 x 轴上方`];
  if (c.lockHeight) conditions.push(`C 到 AB 的距离为 ${c.height}`);
  if (c.lockX) conditions.push(`C 的横坐标为 ${c.x}`);
  const targetUnique = c.lockHeight;
  const question = targetUnique ? {
    level: "中考" as const,
    question: `在平面直角坐标系中，A(0,0)，B(${c.base},0)，C 在 x 轴上方，且点 C 到直线 AB 的距离为 ${c.height}${c.lockX ? `，横坐标为 ${c.x}` : ""}。求 △ABC 的面积。`,
    answer: String(area),
    explanation: `由 AB=${c.base}，C 到 AB 的距离为 ${c.height}，故 S=½×${c.base}×${c.height}=${area}。即使 C 沿与 AB 平行的直线移动，面积仍不变。`,
  } : null;
  const notes = [c.lockHeight
    ? "已知底与高即可确定面积，即使 C 的横坐标仍可自由变化。"
    : "已知底边但未限制高，顶点 C 改变高度会改变面积，目标尚不能定解。"];
  if (c.lockHeight && c.lockX) notes.push("横坐标条件使三角形构型唯一，但对求面积是冗余条件，删掉也不影响答案。");
  return {
    status: degreesOfFreedom === 0 ? "unique" : "continuous",
    degreesOfFreedom,
    points: degreesOfFreedom === 0 ? [{ x: c.x, y: c.height }] : [],
    targetUnique, targetValue: targetUnique ? String(area) : null,
    conditions, notes, question,
  };
}
