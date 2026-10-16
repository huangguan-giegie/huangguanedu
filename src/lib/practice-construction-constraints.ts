/**
 * Small, deterministic 2D constraint engine for school-level constructions.
 * All points come from trusted numeric formulas; AI never supplies coordinates.
 * An invalid or degenerate construction throws instead of rendering a false figure.
 */
export interface Point2 { x: number; y: number }
export interface Triangle2 { A: Point2; B: Point2; C: Point2 }

export const CONSTRUCTION_TOLERANCE = 1e-7;

export function add(a: Point2, b: Point2): Point2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function subtract(a: Point2, b: Point2): Point2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(a: Point2, k: number): Point2 {
  return { x: a.x * k, y: a.y * k };
}
export function dot(a: Point2, b: Point2): number { return a.x * b.x + a.y * b.y; }
export function cross(a: Point2, b: Point2): number { return a.x * b.y - a.y * b.x; }
export function norm(a: Point2): number { return Math.hypot(a.x, a.y); }
export function distance(a: Point2, b: Point2): number { return norm(subtract(a,b)); }
export function near(a: number, b: number, tolerance = CONSTRUCTION_TOLERANCE): boolean {
  return Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a-b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}
function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(`几何约束校验失败：${message}`);
}
function cosine(a: Point2, b: Point2): number {
  const d = norm(a)*norm(b);
  check(d > 1e-10, "夹角含零向量");
  return dot(a,b)/d;
}

export interface BisectorConstruction {
  A: Point2; B: Point2; C: Point2; D: Point2;
  AB: number; AC: number; BC: number;
}
export function verifyBisector(g: BisectorConstruction): void {
  const { A,B,C,D,AB,AC,BC } = g;
  check(AB > 0 && AC > 0 && BC > 0, "边长必须为正");
  check(AB + AC > BC && AB + BC > AC && AC + BC > AB, "三角形不等式");
  check(near(distance(A,B),AB) && near(distance(A,C),AC) && near(distance(B,C),BC), "三角形边长不匹配");
  check(Math.abs(cross(subtract(C,B),subtract(D,B))) < CONSTRUCTION_TOLERANCE * BC * BC, "D 不在 BC 上");
  check(distance(B,D) > 0 && distance(D,C) > 0 && near(distance(B,D)+distance(D,C), BC), "D 必须位于 BC 内部");
  check(near(distance(B,D)*AC, distance(D,C)*AB), "角平分线两侧的比例不匹配");
  check(near(cosine(subtract(B,A),subtract(D,A)),cosine(subtract(D,A),subtract(C,A))), "∠BAD ≠ ∠DAC");
}
export function constructBisector(AB: number, AC: number, BC: number): BisectorConstruction {
  check([AB,AC,BC].every(Number.isFinite), "无效边长");
  check(AB + AC > BC && AB + BC > AC && AC + BC > AB, "不能组成三角形");
  const B={x:0,y:0}, C={x:BC,y:0};
  const ax=(AB*AB-AC*AC+BC*BC)/(2*BC);
  const h2=AB*AB-ax*ax;
  check(h2 > 0, "退化三角形");
  const A={x:ax,y:Math.sqrt(h2)};
  const D={x:BC*AB/(AB+AC),y:0};
  const figure={A,B,C,D,AB,AC,BC};
  verifyBisector(figure);
  return figure;
}

export interface SimilarityConstruction {
  small: Triangle2; large: { D: Point2; E: Point2; F: Point2 };
  smallBase: number; smallHeight: number; factor: number;
}
export function verifySimilarity(g: SimilarityConstruction): void {
  const {small:{A,B,C},large:{D,E,F},smallBase,smallHeight,factor} = g;
  check([smallBase,smallHeight,factor].every(v=>v>0&&Number.isFinite(v)), "非正数参数");
  const ab=distance(A,B), ac=distance(A,C), bc=distance(B,C);
  const de=distance(D,E), df=distance(D,F), ef=distance(E,F);
  check(near(ab,smallBase) && near(ac,smallHeight), "小三角形边长不符");
  check(near(dot(subtract(B,A),subtract(C,A)),0), "小三角形不是直角");
  check(near(dot(subtract(E,D),subtract(F,D)),0), "大三角形不是直角");
  check(near(de/ab,factor) && near(df/ac,factor) && near(ef/bc,factor), "对应三边不成相同比例");
  check(cross(subtract(B,A),subtract(C,A))*cross(subtract(E,D),subtract(F,D))>0, "对应顶点顺序颠倒");
}
export function constructSimilarity(smallBase: number, smallHeight: number, factor: number): SimilarityConstruction {
  const figure: SimilarityConstruction={
    small:{A:{x:0,y:0},B:{x:smallBase,y:0},C:{x:0,y:smallHeight}},
    large:{D:{x:0,y:0},E:{x:smallBase*factor,y:0},F:{x:0,y:smallHeight*factor}},
    smallBase,smallHeight,factor,
  };
  verifySimilarity(figure);
  return figure;
}

export interface ExternalTangentConstruction {
  O1: Point2; O2: Point2; A: Point2; B: Point2;
  largeRadius: number; smallRadius: number; centerDistance: number;
}
export function verifyExternalTangent(g: ExternalTangentConstruction): void {
  const {O1,O2,A,B,largeRadius:R,smallRadius:r,centerDistance:d} = g;
  check(R>r && r>0 && d>=R+r, "两圆必须外离或外切，且大圆半径大于小圆");
  check(near(distance(O1,O2),d), "圆心距不匹配");
  check(near(distance(O1,A),R) && near(distance(O2,B),r), "切点不在对应圆周上");
  const tangent=subtract(B,A);
  check(norm(tangent)>0, "公切线段长度为零");
  check(near(dot(subtract(A,O1),tangent),0) && near(dot(subtract(B,O2),tangent),0), "公切线不与半径垂直");
  check(near(dot(subtract(A,O1),subtract(B,O2))/(R*r),1), "切点不在同侧公切线上");
  check(near(dot(tangent,tangent),d*d-(R-r)*(R-r)), "公切线长度公式不符");
}
export function constructExternalTangent(R: number,r: number,d: number): ExternalTangentConstruction {
  check([R,r,d].every(Number.isFinite)&&R>r&&r>0&&d>=R+r, "两圆外公切线条件不成立");
  const nx=(R-r)/d;
  const ny=Math.sqrt(1-nx*nx);
  check(Number.isFinite(ny), "切线法向量无效");
  const O1={x:0,y:0}, O2={x:d,y:0};
  const n={x:nx,y:ny};
  const A=add(O1,scale(n,R)), B=add(O2,scale(n,r));
  const figure={O1,O2,A,B,largeRadius:R,smallRadius:r,centerDistance:d};
  verifyExternalTangent(figure);
  return figure;
}
