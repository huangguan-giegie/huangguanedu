import { describe, expect, it } from "vitest";
import {
  analyzeWuhanSquare, analyzeWuhanQuadratic, analyzeWuhanBadminton, analyzeHubeiHyperbola,
  analyzeHubeiEllipse, gaokaoLocusPoint, SQUARE_SEGMENT_LIMIT, WUHAN_EQUAL_LENGTH_ROOTS,
  LOCAL_EXAM_CASES, LOCAL_EXAM_DEFAULTS, localExamLesson, measure,
} from "./hubei-exam-cases";

describe("2025武汉中考原卷约束", () => {
  it("第23题保持全等、线段乘积和 n 表达式，含 H=F 边界", () => {
    for (const side of [2, 4, 7]) for (const t of [.05, .4, .5, SQUARE_SEGMENT_LIMIT]) {
      const v = analyzeWuhanSquare(side, t);
      expect(v.valid).toBe(true);
      expect(v.DH).toBeCloseTo(v.GH!, 9);
      expect(v.productLeft).toBeCloseTo(v.productRight!, 9);
      expect(v.ratio).toBeCloseTo((v.n! + 1) / (v.n! * (v.n! + 2)), 9);
    }
    const end = analyzeWuhanSquare(4, SQUARE_SEGMENT_LIMIT);
    expect(measure(end.H!, end.F)).toBeLessThan(1e-8);
    expect(end.ratio).toBeCloseTo(1, 10);
  });
  it("第23题拒绝线段外的 H、平行无交点和零比值的退化构型", () => {
    expect(analyzeWuhanSquare(4, .8).valid).toBe(false);
    expect(analyzeWuhanSquare(4, .8).ratio).toBeNull();
    expect(analyzeWuhanSquare(4, 1).H).toBeNull();
    expect(analyzeWuhanSquare(4, 0).n).toBeNull();
    expect(() => analyzeWuhanSquare(0, .5)).toThrow("边长");
  });
  it("第24题按水平 PM、竖直 PN 求出两解，并排除端点和重合", () => {
    expect(WUHAN_EQUAL_LENGTH_ROOTS[0]).toBeCloseTo(-.9282032303, 9);
    for (const x of WUHAN_EQUAL_LENGTH_ROOTS) {
      const v = analyzeWuhanQuadratic(x, -.25);
      expect(v.pointValid).toBe(true);
      expect(v.P.y).toBe(v.M.y);
      expect(v.P.x).toBe(v.N.x);
      expect(v.PM).toBeCloseTo(v.PN, 10);
    }
    for (const x of [-2, 0, 6]) expect(analyzeWuhanQuadratic(x, -.25).pointValid).toBe(false);
  });
  it("第24题面积比 3/4 反求得到 C(−4,1)、D(3,−3/4) 与 k=−1/4", () => {
    const v = analyzeWuhanQuadratic(2, -.25);
    expect(v.C).toEqual({ x: -4, y: 1 });
    expect(v.D).toEqual({ x: 3, y: -.75 });
    expect(v.E!.x).toBeCloseTo(-10 / 3);
    expect(v.F!.x).toBeCloseTo(10 / 3);
    expect(v.areaRatio).toBeCloseTo(.75, 10);
    expect(analyzeWuhanQuadratic(2, 0).areaRatio).toBeNull();
    expect(analyzeWuhanQuadratic(2, .5).chordValid).toBe(false);
  });
  it("第22题拟合全表，使用距球网的落地距离，并排除两个严格不等式端点", () => {
    const v = analyzeWuhanBadminton(.8);
    for (const [x, y] of [[0, 1.1], [2, 2.3], [3, 2.6], [5, 2.6], [6, 2.3]]) expect(v.height(x)).toBeCloseTo(y, 10);
    expect(v.vertex).toEqual({ x: 4, y: 2.7 });
    expect(v.landing).toBeGreaterThan(6);
    expect(v.distanceFromNet).toBeLessThan(6);
    expect(v.eligible).toBe(true);
    for (const k of [.7, 1, .6, 1.1]) expect(analyzeWuhanBadminton(k).eligible).toBe(false);
    for (const k of [.7001, .85, .9999]) expect(analyzeWuhanBadminton(k).eligible).toBe(true);
  });
});

describe("湖北高考原卷约束与精确结论", () => {
  it("2022第21题与所附解析一致：斜率−1、面积16√2/9", () => {
    const v = analyzeHubeiHyperbola(5 / 3);
    expect(v.valid).toBe(true);
    for (const p of v.points) expect(p.x * p.x / 2 - p.y * p.y).toBeCloseTo(1, 10);
    expect(v.slopes![0] + v.slopes![1]).toBeCloseTo(0, 10);
    expect(v.angleTangent).toBeCloseTo(2 * Math.sqrt(2), 10);
    expect(v.area).toBeCloseTo(16 * Math.sqrt(2) / 9, 10);
  });
  it("2022第21题处理相切、无交点、弦经过 A 以及双曲线负截距分支", () => {
    expect(analyzeHubeiHyperbola(0).points).toHaveLength(0);
    for (const b of [-1, 1]) expect(analyzeHubeiHyperbola(b).points).toHaveLength(1);
    expect(analyzeHubeiHyperbola(3).slopes).toBeNull();
    const negative = analyzeHubeiHyperbola(-2);
    expect(negative.valid).toBe(true);
    expect(negative.slopes![0] + negative.slopes![1]).toBeCloseTo(0, 10);
  });
  it("2025第18题在射线上构 R，保持长度乘积，拒绝轴上 P", () => {
    for (const P of [{ x: 2, y: -2 }, { x: -3, y: 4 }, { x: .1, y: -1 }]) {
      const v = analyzeHubeiEllipse(P, 30);
      expect(v.valid).toBe(true);
      expect(v.rayProduct).toBeCloseTo(3, 10);
      const ap = { x: P.x, y: P.y + 1 }, ar = { x: v.R!.x, y: v.R!.y + 1 };
      expect(ap.x * ar.x + ap.y * ar.y).toBeGreaterThan(0);
    }
    expect(analyzeHubeiEllipse({ x: 0, y: -1 }, 0).R).toBeNull();
    expect(analyzeHubeiEllipse(gaokaoLocusPoint(90), 0).valid).toBe(false);
  });
  it("2025第18题的等号构型取得所附答案3(√3+√2)，斜率倍数成立", () => {
    const v = analyzeHubeiEllipse(gaokaoLocusPoint(240), 30);
    expect(v.onLocus && v.valid).toBe(true);
    expect(v.slopeOR).toBeCloseTo(3 * v.slopeOP!, 10);
    expect(v.PM).toBeCloseTo(3 * (Math.sqrt(3) + Math.sqrt(2)), 10);
    expect(v.KM).toBeCloseTo(3 * Math.sqrt(3), 10);
  });
  it("5道真题各问均有来源、证明和有限的画布坐标", () => {
    for (const source of LOCAL_EXAM_CASES) for (let stage = 0; stage < (source.id === "hyperbola" ? 2 : 3); stage++) {
      const lesson = localExamLesson(source.id, LOCAL_EXAM_DEFAULTS[source.id], stage);
      expect(source.page).toBeGreaterThan(0);
      expect(lesson.parts[stage].kind).toBe("proved");
      expect(lesson.parts[stage].proof.length).toBeGreaterThan(40);
      expect(lesson.paths.flatMap(p => p.points).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(JSON.stringify(lesson)).not.toMatch(/NaN|Infinity/);
    }
  });
});
