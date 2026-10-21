import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HubeiExamLab } from "../components/HubeiExamLab";
import { GeometryLab } from "../components/GeometryLab";
import { MathStudio } from "../components/MathStudio";
import { activeNavigation } from "../components/academy-navigation";
import { LOCAL_EXAM_CASES } from "./hubei-exam-cases";
import { transformFunctionExpression } from "../components/FunctionExamExplorer";
import { compileExpression } from "./diagram-renderer/expression-parser";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("统一数学实验室入口", () => {
  it("图像变换支持 CAS 的隐式乘法，保留函数名，并正确归一化全角输入", () => {
    for (const expression of ["x^2-5x+6", "2x+1", "exp(x)", "sin(x)", "２ｘ＋１"]) {
      const base = compileExpression(expression).evaluate;
      const transformed = compileExpression(transformFunctionExpression(expression, 2, 3, .5, -1)).evaluate;
      for (const x of [0, .4, 2]) expect(transformed(x)).toBeCloseTo(2 * base(3 * (x - .5)) - 1, 9);
    }
  });
  it("默认先进入真实试卷，保留定理、函数、圆锥曲线与 CAS 的明确入口", () => {
    const html = renderToStaticMarkup(createElement(GeometryLab));
    expect(html).toContain("2025 武汉中考");
    expect(html).toContain("原题约束检查");
    expect(html).toContain("数学实验室统一导航");
    expect(html).toContain('/math-studio?view=functions');
    expect(html).not.toContain("高考三角函数");
    expect(html).not.toContain("高考指对数函数");
  });
  it("定理入口仍可渲染原有可拖动画布", () => {
    const html = renderToStaticMarkup(createElement(GeometryLab, { workshop: "theorems" }));
    expect(html).toContain("角平分线");
    expect(html).toContain("拖动或用方向键改变顶点 A");
  });
  it("全部新案例均可在服务端渲染来源、题设和图形", () => {
    for (const c of LOCAL_EXAM_CASES) {
      const html = renderToStaticMarkup(createElement(HubeiExamLab, { initialCase: c.id }));
      expect(html).toContain(c.file);
      expect(html).toContain(c.title);
      expect(html).toContain('role="img"');
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
  it("函数与 CAS 分别呈现，函数仅使用唯一绘图组件，表达式可以从真题带入", () => {
    const graph = renderToStaticMarkup(createElement(MathStudio, { initialExpression: "x^2/4-3" }));
    expect(graph).toContain("x^2/4-3");
    expect(graph).not.toContain("展开 / 化简");
    const cas = renderToStaticMarkup(createElement(MathStudio, { view: "cas" }));
    expect(cas).toContain("展开 / 化简");
    expect(cas).not.toContain("函数图像变换 ·");
    expect(activeNavigation("/math-studio", [{ href: "/geometry-lab" }])).toBe("/geometry-lab");
    expect(activeNavigation("/geometry-editor", [{ href: "/geometry-lab" }])).toBe("/geometry-lab");
  });
});
