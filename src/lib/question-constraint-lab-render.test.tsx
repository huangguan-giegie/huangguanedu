import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExamConstraintLab } from "../components/ExamConstraintLab";
import { GeometryLab } from "../components/GeometryLab";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));

describe("命题实验室的 SSR 与实验室入口", () => {
  it("默认页面包含三个确定性场景、约束复选框与数学 SVG", () => {
    const html = renderToStaticMarkup(createElement(ExamConstraintLab));
    expect(html).toContain("数学命题实验室");
    expect(html).toContain("圆上的点");
    expect(html).toContain("抛物线交点");
    expect(html).toContain("动点与定面积");
    expect(html).toContain('viewBox="0 0 720 420"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('type="range"');
    expect(html).toContain("尚未定解");
    expect(html).toContain("反向命题：自动构造可定解条件");
    expect(html).toContain("disabled");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("复用原有动态实验室，不破坏旧的定理入口", () => {
    const html = renderToStaticMarkup(createElement(GeometryLab));
    expect(html).toContain("真题探究");
    expect(html).toContain("几何定理");
    expect(html).toContain("自由作图");
    expect(html).toContain("圆锥曲线");
  });
});
