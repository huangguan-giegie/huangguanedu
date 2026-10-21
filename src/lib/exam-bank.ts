import type { GeometryDocument, GeometryObject } from "./free-geometry";
import { compileExpression } from "./diagram-renderer/expression-parser";
import type { LocalExamId } from "./hubei-exam-cases";

export type ExamCurve = { name: string; x: string; y: string; from: number; to: number };
export type ExamParameter = { key: string; label: string; value: number; min: number; max: number; step: number };
export type ExamModel = {
  curves: ExamCurve[]; parameters?: ExamParameter[]; bounds: [number, number, number, number];
  note?: string; geometry?: GeometryDocument; lesson?: LocalExamId;
};
export type ExamPaper = { id: string; year: number; stage: "中考" | "高考"; name: string; file: string; total: number; note?: string };
export type ExamQuestion = { id: string; paper: string; number: number; title: string; topic: string; pages: number[]; model: ExamModel };

export const EXAM_PAPERS: ExamPaper[] = [
  ...[2016, 2017, 2018, 2020].flatMap(year => (["s", "a"] as const).map(track => ({
    id: `${year}${track}`, year, stage: "高考" as const, name: `全国Ⅰ卷·${track === "s" ? "理科" : "文科"}`,
    file: `${year}全国卷I数学（${track === "s" ? "理" : "文"}）真题.pdf`, total: year === 2016 ? 24 : 23,
  }))),
  { id: "2019s", year: 2019, stage: "高考", name: "全国Ⅰ卷·理科", file: "2019全国卷I数学（理）真题.pdf", total: 23 },
  ...[2020, 2021, 2022, 2025, 2026].map(year => ({ id: `${year}n`, year, stage: "高考" as const,
    name: year >= 2025 ? "全国Ⅰ卷" : "新高考Ⅰ卷", total: year >= 2025 ? 19 : 22,
    file: year === 2026 ? "2026年全国一卷数学答案.pdf" : year === 2025 ? "2025全国一卷数学真题.pdf" : `${year}全国新高考I卷数学真题.pdf`,
    note: year === 2020 ? "资料中的对照卷；2020年湖北使用全国Ⅰ卷。" : year === 2026 ? "年份按所提供文件标注；原文件为题目与解析合订本。" : undefined,
  })),
  { id: "wuhan2025", year: 2025, stage: "中考", name: "武汉中考", file: "中考数学.pdf", total: 24 },
];

export const parameter = (key: string, value: number, min = -5, max = 5, label = key, step = .1): ExamParameter => ({ key, label, value, min, max, step });
export const graph = (expressions: string[], bounds: ExamModel["bounds"] = [-6, 6, -5, 7], parameters?: ExamParameter[], note?: string): ExamModel => ({
  curves: expressions.map(y => ({ name: `y = ${y}`, x: "x", y, from: bounds[0], to: bounds[1] })), bounds, parameters, note,
});
export const ellipse = (a: string, b: string, parameters?: ExamParameter[], extra: ExamCurve[] = []): ExamModel => ({
  curves: [{ name: `椭圆 (${a} cos t, ${b} sin t)`, x: `(${a})*cos(x)`, y: `(${b})*sin(x)`, from: 0, to: Math.PI * 2 }, ...extra],
  parameters, bounds: [-6, 6, -5, 5],
});
export const hyperbola = (a: string, b: string, parameters?: ExamParameter[]): ExamModel => ({
  ...graph([`(${b})*sqrt(x^2/(${a})^2-1)`, `-(${b})*sqrt(x^2/(${a})^2-1)`], [-6, 6, -6, 6], parameters),
});
export const horizontalParabola = (p: string, parameters?: ExamParameter[]): ExamModel => ({ curves: [
  { name: `y² = 2(${p})x`, x: `x^2/(2*(${p}))`, y: "x", from: -8, to: 8 },
], bounds: [-3, 10, -7, 7], parameters });
export function geometry(points: [string, number, number][], edges?: [string, string][], note?: string): ExamModel {
  const ids = Object.fromEntries(points.map(([label], i) => [label, `g${i + 1}`]));
  const objects: GeometryObject[] = points.map(([label, x, y], i) => ({ id: `g${i + 1}`, kind: "point", label, x, y }));
  const lines = edges ?? points.map(([name], i) => [name, points[(i + 1) % points.length][0]] as [string, string]);
  for (const [a, b] of lines) objects.push({ id: `g${objects.length + 1}`, kind: "segment", label: a + b, a: ids[a], b: ids[b] });
  return { curves: [], bounds: [-6, 6, -5, 7], geometry: { version: 1, objects },
    note: note ?? "已载入题设的初始构型，可添加辅助线、交点并测量。自由作图中拖动自由点会改变条件，请结合原题核对边长、角度和位置。" };
}
export const line = (expression: string, from = -8, to = 8): ExamCurve => ({ name: `y = ${expression}`, x: "x", y: expression, from, to });
export const circle = (x: number, y: number, radius: string): ExamCurve => ({
  name: `圆心 (${x}, ${y})，半径 ${radius}`, x: `${x}+(${radius})*cos(x)`, y: `${y}+(${radius})*sin(x)`, from: 0, to: 2 * Math.PI,
});
export const triangle = (a: number, b: number, c: number) => {
  const cx = (b * b + c * c - a * a) / (2 * c);
  return geometry([["A", 0, 0], ["B", c, 0], ["C", cx, Math.sqrt(Math.max(0, b * b - cx * cx))]]);
};
export const lesson = (id: LocalExamId): ExamModel => ({ curves: [], bounds: [-6, 6, -5, 7], lesson: id });

export function substituteExamParameters(expression: string, values: Record<string, number>): string {
  return expression.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key: string) => {
    const value = values[key];
    if (!Number.isFinite(value)) throw Error(`参数 ${key} 无效`);
    return `(${value})`;
  });
}
export function sampleExamCurve(curve: ExamCurve, values: Record<string, number>, samples = 640) {
  const fx = compileExpression(substituteExamParameters(curve.x, values)).evaluate;
  const fy = compileExpression(substituteExamParameters(curve.y, values)).evaluate;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = curve.from + (curve.to - curve.from) * i / samples;
    return { x: fx(t), y: fy(t) };
  });
}
