import { z } from "zod";

/**
 * Advanced mathematical figures have a restricted, declarative vocabulary.
 * Renderers never interpret model-written pixels, coordinates, paths or SVG.
 * All given measures, labels and answers are compiled by trusted code.
 */
export const advancedDiagramOptions = [
  z.object({
    type: z.literal("circle_sector"),
    radius: z.number().int().min(2).max(12),
    centralAngle: z.union([z.literal(30),z.literal(45),z.literal(60),z.literal(90),z.literal(120)]),
    task: z.enum(["ARC_LENGTH", "SECTOR_AREA"]),
  }),
  z.object({
    type: z.literal("circle_inscribed_angle"),
    centralAngle: z.union([z.literal(60),z.literal(80),z.literal(90),z.literal(100),z.literal(120),z.literal(140)]),
  }),
  z.object({
    type: z.literal("circle_tangent"),
    triple: z.enum(["3-4-5","5-12-13","8-15-17"]),
  }),
  z.object({
    type: z.literal("circle_chord"),
    triple: z.enum(["3-4-5","5-12-13","8-15-17"]),
  }),
  z.object({
    type: z.literal("triangle_altitude"),
    base: z.number().int().min(6).max(24).refine((v) => v % 2 === 0),
    height: z.number().int().min(2).max(15),
    foot: z.enum(["LEFT", "MIDDLE", "RIGHT"]),
  }),
  z.object({
    type: z.literal("triangle_midline"),
    base: z.number().int().min(4).max(24).refine((v) => v % 2 === 0),
  }),
  z.object({
    type: z.literal("quadratic_vertex"),
    a: z.number().int().min(-2).max(2).refine((v) => v !== 0),
    h: z.number().int().min(-2).max(2),
    k: z.number().int().min(-4).max(4),
  }),
  z.object({
    type: z.literal("linear_intersection"),
    slopes: z.enum(["1,-1", "2,-1", "1,-2", "-1,2", "-2,1", "2,-2"]),
    x: z.number().int().min(-2).max(2),
    y: z.number().int().min(-3).max(3),
  }),
  z.object({
    type: z.literal("quadratic_line_intersection"),
    roots: z.enum(["-3,1","-2,2","-1,3","-3,2","-1,2","0,3","-2,1"]),
    slope: z.number().int().min(-2).max(2),
    intercept: z.number().int().min(-3).max(3),
  }),
] as const;

export const AdvancedDiagramSchema = z.discriminatedUnion("type", advancedDiagramOptions);
export type AdvancedDiagram = z.infer<typeof AdvancedDiagramSchema>;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return Math.abs(a);
}

/** Reduce a positive rational multiple of pi to an exact symbolic expression. */
export function exactPi(numerator: number, denominator: number): string {
  const divisor = gcd(numerator, denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  if (d === 1) return n === 1 ? "π" : `${n}π`;
  return n === 1 ? `π/${d}` : `${n}π/${d}`;
}

export function linearEquation(slope: number, intercept: number): string {
  const first = slope === 0 ? "" : slope === 1 ? "x" : slope === -1 ? "-x" : `${slope}x`;
  if (!first) return `y = ${intercept}`;
  if (intercept === 0) return `y = ${first}`;
  return `y = ${first}${intercept > 0 ? " + " : " - "}${Math.abs(intercept)}`;
}

export function quadraticEquation(a: number, b: number, c: number): string {
  const lead = a === 1 ? "x²" : a === -1 ? "-x²" : `${a}x²`;
  const xTerm = b === 0 ? "" : `${b > 0 ? " + " : " - "}${Math.abs(b) === 1 ? "" : Math.abs(b)}x`;
  const constant = c === 0 ? "" : `${c > 0 ? " + " : " - "}${Math.abs(c)}`;
  return `y = ${lead}${xTerm}${constant}`;
}

export function vertexEquation(a: number, h: number, k: number): string {
  const first = a === 1 ? "" : a === -1 ? "-" : String(a);
  const x = h === 0 ? "x²" : `(x ${h > 0 ? "-" : "+"} ${Math.abs(h)})²`;
  return `y = ${first}${x}${k > 0 ? ` + ${k}` : k < 0 ? ` - ${-k}` : ""}`;
}

export function rootFactor(root: number): string {
  return root === 0 ? "x" : `(x ${root > 0 ? "-" : "+"} ${Math.abs(root)})`;
}

export interface AdvancedProblem {
  question: string;
  answer: string;
  explanation: string;
  diagram: AdvancedDiagram;
}

/** Mathematics, not the model, is the source of truth. */
export function compileAdvancedDiagramProblem(diagram: AdvancedDiagram): AdvancedProblem {
  switch (diagram.type) {
    case "circle_sector": {
      const { radius: r, centralAngle: t, task } = diagram;
      const length = exactPi(t * r, 180);
      const area = exactPi(t * r * r, 360);
      return task === "ARC_LENGTH"
        ? {
          question: `如图，圆 O 的半径 OA＝OB＝${r} cm，圆心角 ∠AOB＝${t}°，求劣弧 AB 的长度（答案保留 π）。`,
          answer: `${length} cm`,
          explanation: `弧长 l＝(圆心角/360°)×2πr＝${t}/360×2π×${r}＝${length} cm。`,
          diagram,
        }
        : {
          question: `如图，圆 O 的半径 OA＝OB＝${r} cm，圆心角 ∠AOB＝${t}°，求扇形 AOB 的面积（答案保留 π）。`,
          answer: `${area} cm²`,
          explanation: `扇形面积 S＝(圆心角/360°)×πr²＝${t}/360×π×${r}²＝${area} cm²。`,
          diagram,
        };
    }
    case "circle_inscribed_angle": {
      const t = diagram.centralAngle;
      return {
        question: `如图，A、B、C 在圆 O 上，C 位于不含劣弧 AB 的圆弧上，圆心角 ∠AOB＝${t}°，求圆周角 ∠ACB。`,
        answer: `${t / 2}°`,
        explanation: `∠ACB 与 ∠AOB 所对的都是劣弧 AB，圆周角等于同弧所对圆心角的一半，所以 ∠ACB＝${t}°÷2＝${t / 2}°。`,
        diagram,
      };
    }
    case "circle_tangent": {
      const [radius, tangent, hypotenuse] = diagram.triple.split("-").map(Number);
      return {
        question: `如图，PA 是圆 O 在 A 点的切线，半径 OA＝${radius} cm，切线段 PA＝${tangent} cm，求线段 OP 的长度。`,
        answer: `${hypotenuse} cm`,
        explanation: `切线性质：OA⊥PA，因此△OAP 在 A 处为直角。由勾股定理 OP²＝OA²＋AP²＝${radius}²＋${tangent}²＝${hypotenuse * hypotenuse}，故 OP＝${hypotenuse} cm。`,
        diagram,
      };
    }
    case "circle_chord": {
      const [distance, halfChord, radius] = diagram.triple.split("-").map(Number);
      return {
        question: `如图，圆 O 的半径 OB＝${radius} cm，OH⊥弦 AB 于 H，OH＝${distance} cm。求弦 AB 的长度。`,
        answer: `${halfChord * 2} cm`,
        explanation: `垂径定理得 AH＝HB；在直角三角形 OHB 中，HB＝√(OB²－OH²)＝√(${radius}²－${distance}²)＝${halfChord} cm，因此 AB＝2HB＝${halfChord * 2} cm。`,
        diagram,
      };
    }
    case "triangle_altitude": {
      const { base, height } = diagram;
      return {
        question: `如图，在△ABC 中，CD⊥AB，垂足为 D，AB＝${base} cm，CD＝${height} cm。求△ABC 的面积。`,
        answer: `${base * height / 2} cm²`,
        explanation: `三角形面积＝底×高÷2＝${base}×${height}÷2＝${base * height / 2} cm²。CD 是 AB 边上的高。`,
        diagram,
      };
    }
    case "triangle_midline": {
      const base = diagram.base;
      return {
        question: `如图，M、N 分别是△ABC 的边 AB、AC 的中点，连接 MN，已知 BC＝${base} cm，求 MN 的长度。`,
        answer: `${base / 2} cm`,
        explanation: `三角形中位线定理：MN∥BC 且 MN＝BC/2＝${base}/2＝${base / 2} cm。`,
        diagram,
      };
    }
    case "quadratic_vertex": {
      const { a, h, k } = diagram;
      const eq = vertexEquation(a, h, k);
      return {
        question: `如图，二次函数 ${eq} 的图像是一条抛物线，求其顶点坐标及对称轴方程。`,
        answer: `顶点(${h}, ${k})，对称轴 x = ${h}`,
        explanation: `函数已写成顶点式 y＝a(x－h)²＋k，因此顶点为(${h}, ${k})，对称轴为 x＝${h}。`,
        diagram,
      };
    }
    case "linear_intersection": {
      const [m1,m2] = diagram.slopes.split(",").map(Number);
      const { x, y } = diagram;
      const b1 = y - m1 * x;
      const b2 = y - m2 * x;
      return {
        question: `如图，直线 l₁：${linearEquation(m1,b1)} 与 l₂：${linearEquation(m2,b2)} 相交于点 P，求交点 P 的坐标。`,
        answer: `P(${x}, ${y})`,
        explanation: `联立两条直线方程，相减消去 y：(${m1}－(${m2}))x＝${b2}－(${b1})，解得 x＝${x}，代入任一直线得 y＝${y}，所以 P(${x}, ${y})。`,
        diagram,
      };
    }
    case "quadratic_line_intersection": {
      const [r1,r2] = diagram.roots.split(",").map(Number);
      const { slope: m, intercept: b } = diagram;
      const quad = quadraticEquation(1, m - r1 - r2, r1 * r2 + b);
      const line = linearEquation(m, b);
      const y1 = m * r1 + b;
      const y2 = m * r2 + b;
      return {
        question: `如图，抛物线 ${quad} 与直线 ${line} 相交于 A、B 两点，求这两个交点的坐标。`,
        answer: `A(${r1}, ${y1})，B(${r2}, ${y2})`,
        explanation: `联立两式并移项，得 ${rootFactor(r1)}${rootFactor(r2)}＝0，因此 x＝${r1} 或 x＝${r2}；代入直线 ${line}，得 y＝${y1} 或 ${y2}。故 A(${r1}, ${y1})，B(${r2}, ${y2})。`,
        diagram,
      };
    }
  }
}
