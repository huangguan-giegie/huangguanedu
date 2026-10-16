import { describe, expect, it } from "vitest";
import { compileExpression } from "./expression-parser";
import { computeFunctionCurves, computeTicks, sampleAndSegment } from "./curve-sampler";

const segment = (expr: string, xMin: number, xMax: number, samples = 100) =>
  sampleAndSegment(compileExpression(expr), xMin, xMax, samples);

describe("曲线分段 - 反比例函数跨渐近线", () => {
  it("y=1/x 在 [-5,5] 恰好分成 2 段", () => {
    expect(segment("1/x", -5, 5)).toHaveLength(2);
  });

  it("两段分别位于 x<0 与 x>0，不存在跨越 x=0 的连线", () => {
    const segs = segment("1/x", -5, 5);
    expect(segs).toHaveLength(2);
    for (const seg of segs) {
      for (let i = 1; i < seg.length; i += 1) {
        // 同一段内不允许出现 x 由负跳到正（那正是原来的竖直假线）
        const crossed = seg[i - 1].x < 0 && seg[i].x > 0;
        expect(crossed).toBe(false);
      }
    }
  });

  it("y=1/x 在正区间 [0.2,5] 只有 1 段", () => {
    expect(segment("1/x", 0.2, 5)).toHaveLength(1);
  });

  it("y=1/(x-1) 在 x=1 处断开为 2 段", () => {
    expect(segment("1/(x-1)", -5, 5)).toHaveLength(2);
  });

  it("y=1/(x^2-4) 在 x=±2 两条渐近线处分成 3 段", () => {
    expect(segment("1/(x^2-4)", -5, 5)).toHaveLength(3);
  });

  it("y=1/x^2 同号发散也必须断开为 2 段", () => {
    expect(segment("1/x^2", -5, 5)).toHaveLength(2);
  });

  it("采样点恰好命中 x=0 时仍能正确分段", () => {
    // samples=100 时 xMin + (xMax-xMin)*50/100 精确为 0
    const segs = segment("1/x", -5, 5, 100);
    expect(segs).toHaveLength(2);
    for (const seg of segs) {
      expect(seg.some((p) => p.x === 0)).toBe(false);
    }
  });
});

describe("曲线分段 - 不误杀陡而连续的曲线", () => {
  it("一次函数 1 段", () => {
    expect(segment("2x+1", -5, 5)).toHaveLength(1);
  });

  it("二次函数 1 段", () => {
    expect(segment("x^2-2x+1", -5, 5)).toHaveLength(1);
  });

  it("陡峭二次函数 y=50x² 仍为 1 段", () => {
    expect(segment("50x^2", -5, 5)).toHaveLength(1);
  });

  it("极陡二次函数 y=1000x² 仍为 1 段（原固定阈值方案会误杀）", () => {
    expect(segment("1000x^2", -5, 5)).toHaveLength(1);
  });

  it("sqrt(x) 定义域外不产生 NaN 点，1 段", () => {
    const segs = segment("sqrt(x)", -5, 5);
    expect(segs).toHaveLength(1);
    for (const p of segs[0]) {
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("abs(x) 的 V 形折点不导致断开", () => {
    expect(segment("abs(x)", -5, 5)).toHaveLength(1);
  });
});

describe("函数图布局 - 单条曲线失败不影响整体", () => {
  const base = { shapeType: "function-graph" as const, vertices: [] };

  it("一次 + 二次函数各渲染 1 段", () => {
    const layout = computeFunctionCurves({
      ...base,
      functions: [{ expr: "y=2x+1" }, { expr: "y=x^2-2x+1" }],
    });
    expect(layout.curves).toHaveLength(2);
    expect(layout.curves[0].segments).toHaveLength(1);
    expect(layout.curves[1].segments).toHaveLength(1);
    expect(layout.errors).toHaveLength(0);
    expect(layout.axes).not.toBeNull();
  });

  it("一条解析失败 + 一条成功：坐标轴与成功曲线照常渲染，非空白", () => {
    const layout = computeFunctionCurves({
      ...base,
      functions: [{ expr: "y=2x+" }, { expr: "y=2x+1" }],
    });
    expect(layout.errors).toHaveLength(1);
    expect(layout.errors[0].expr).toBe("y=2x+");
    expect(layout.curves).toHaveLength(1);
    expect(layout.axes).not.toBeNull();
  });

  it("全部曲线解析失败且有 keyPoints：坐标轴仍渲染", () => {
    const layout = computeFunctionCurves({
      ...base,
      functions: [{ expr: "y=x2" }],
      keyPoints: [{ x: 1, y: 1, label: "A" }],
    });
    expect(layout.errors).toHaveLength(1);
    expect(layout.curves).toHaveLength(0);
    expect(layout.axes).not.toBeNull();
    expect(layout.keyPoints).toHaveLength(1);
  });

  it("反比例在布局层被切为 2 段", () => {
    const layout = computeFunctionCurves({
      ...base,
      functions: [{ expr: "y=1/x", domain: [-5, 5] }],
    });
    expect(layout.curves[0].segments).toHaveLength(2);
  });

  it("y 范围不被渐近线极值压扁（0 被纳入区间）", () => {
    const layout = computeFunctionCurves({
      ...base,
      functions: [{ expr: "y=1/x", domain: [-5, 5] }],
    });
    expect(layout.domain.yMin).toBeLessThanOrEqual(0);
    expect(layout.domain.yMax).toBeGreaterThan(0);
    expect(layout.domain.yMax - layout.domain.yMin).toBeLessThan(60);
  });
});

describe("坐标轴刻度", () => {
  it("生成整齐的整数刻度", () => {
    const ticks = computeTicks(-5, 5);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks).toContain(0);
    for (const t of ticks) {
      expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("区间包含 0 时 0 一定在刻度中", () => {
    expect(computeTicks(-10, 10)).toContain(0);
    expect(computeTicks(-1, 3)).toContain(0);
  });
});
