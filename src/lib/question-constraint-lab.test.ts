import { describe, expect, it } from "vitest";
import { analyzeCircle, analyzeParabola, analyzeTriangle } from "./question-constraint-lab";

const circle = {
  radius: 5, y: 3, lockY: false, positiveX: false, target: "point" as const,
};
const parabola = {
  p: 1, x: 4, lockX: false, positiveY: false, target: "point" as const,
};
const triangle = {
  base: 6, height: 4, x: 2, lockHeight: false, lockX: false,
};

describe("数学命题实验室：构型自由度与目标定解分开判断", () => {
  it("只有圆方程时仍有一维自由度，不能生成坐标题", () => {
    const a = analyzeCircle(circle);
    expect(a.status).toBe("continuous");
    expect(a.degreesOfFreedom).toBe(1);
    expect(a.targetUnique).toBe(false);
    expect(a.question).toBeNull();
  });
  it("圆加 y=3 有两交点，增加 x>0 后才得到 P(4,3)", () => {
    const both = analyzeCircle({ ...circle, lockY: true });
    expect(both.status).toBe("multiple");
    expect(both.degreesOfFreedom).toBe(0);
    expect(both.points).toEqual([{ x: -4, y: 3 }, { x: 4, y: 3 }]);
    expect(both.question).toBeNull();
    const one = analyzeCircle({ ...circle, lockY: true, positiveX: true });
    expect(one.status).toBe("unique");
    expect(one.targetValue).toBe("P(4, 3)");
    expect(one.question?.question).toContain("x>0");
    expect(one.question?.answer).toBe("P(4, 3)");
  });
  it("点并不唯一，但 x² 是定值，允许生成正确题目", () => {
    const a = analyzeCircle({ ...circle, lockY: true, target: "square" });
    expect(a.status).toBe("multiple");
    expect(a.targetUnique).toBe(true);
    expect(a.targetValue).toBe("16");
    expect(a.question?.question).toContain("x² 的值");
    expect(a.question?.answer).toBe("16");
  });
  it("圆切线处仅有零根；严格正数不等式使其无解", () => {
    const tangent = analyzeCircle({ ...circle, y: 5, lockY: true });
    expect(tangent.points).toEqual([{ x: 0, y: 5 }]);
    expect(tangent.targetUnique).toBe(true);
    const impossible = analyzeCircle({ ...circle, y: 5, lockY: true, positiveX: true });
    expect(impossible.status).toBe("none");
    expect(impossible.degreesOfFreedom).toBeNull();
    expect(impossible.question).toBeNull();
  });
  it("截线超出圆时无解，不能用伪答案出题", () => {
    const a = analyzeCircle({ ...circle, y: 7, lockY: true, target: "square" });
    expect(a.status).toBe("none");
    expect(a.targetUnique).toBe(false);
    expect(a.question).toBeNull();
  });
  it("抛物线 y²=4x 与 x=4 有两个点，y>0 唯一", () => {
    const two = analyzeParabola({ ...parabola, lockX: true });
    expect(two.points).toEqual([{ x: 4, y: -4 }, { x: 4, y: 4 }]);
    expect(two.status).toBe("multiple");
    const one = analyzeParabola({ ...parabola, lockX: true, positiveY: true });
    expect(one.targetUnique).toBe(true);
    expect(one.question?.level).toBe("高考");
    expect(one.targetValue).toBe("P(4, 4)");
  });
  it("抛物线 x<0 无实数交点，顶点处严格正根不成立", () => {
    expect(analyzeParabola({ ...parabola, x: -1, lockX: true }).status).toBe("none");
    expect(analyzeParabola({ ...parabola, x: 0, lockX: true, positiveY: true }).status).toBe("none");
    expect(analyzeParabola({ ...parabola, x: 0, lockX: true }).points).toEqual([{ x: 0, y: 0 }]);
  });
  it("抛物线仍是两交点时 y² 可以唯一决定", () => {
    const a = analyzeParabola({ ...parabola, lockX: true, target: "square" });
    expect(a.status).toBe("multiple");
    expect(a.targetUnique).toBe(true);
    expect(a.question?.answer).toBe("16");
  });
  it("三角形固定底边、高而不固定横坐标时，面积已是定值", () => {
    const a = analyzeTriangle({ ...triangle, lockHeight: true });
    expect(a.status).toBe("continuous");
    expect(a.degreesOfFreedom).toBe(1);
    expect(a.targetUnique).toBe(true);
    expect(a.question?.answer).toBe("12");
  });
  it("额外给出 C 的横坐标让构型唯一，但对面积目标是冗余的", () => {
    const a = analyzeTriangle({ ...triangle, lockHeight: true, lockX: true });
    expect(a.status).toBe("unique");
    expect(a.degreesOfFreedom).toBe(0);
    expect(a.question?.answer).toBe("12");
    expect(a.notes.join(" ")).toContain("冗余条件");
  });
  it("只知道横坐标但不知道高，面积不唯一", () => {
    const a = analyzeTriangle({ ...triangle, lockX: true });
    expect(a.degreesOfFreedom).toBe(1);
    expect(a.targetUnique).toBe(false);
    expect(a.question).toBeNull();
  });
  it("不允许非整数或越界参数混入宣称确定的数学题", () => {
    expect(() => analyzeCircle({ ...circle, radius: 0 })).toThrow();
    expect(() => analyzeCircle({ ...circle, radius: NaN })).toThrow();
    expect(() => analyzeParabola({ ...parabola, p: 20 })).toThrow();
    expect(() => analyzeTriangle({ ...triangle, height: 1.2 })).toThrow();
  });
});
