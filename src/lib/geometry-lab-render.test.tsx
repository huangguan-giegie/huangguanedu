import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GeometryLab } from "../components/GeometryLab";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));

describe("动态几何实验室 SSR 和无障碍控制",()=>{
  it("首屏可渲染画布、模式按钮、辅助线开关和滑块，不依赖 window",()=>{
    const html=renderToStaticMarkup(createElement(GeometryLab,{workshop:"theorems"}));
    expect(html).toContain("动态几何实验室");
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 720 420"');
    expect(html).toContain("角平分线");
    expect(html).toContain("相似三角形");
    expect(html).toContain("两圆公切线");
    expect(html).toContain("拖动或用方向键改变顶点 A");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("不会修改正式模拟题");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("初始实验只呈现几何测量，不会创建考试答案提交表单",()=>{
    const html=renderToStaticMarkup(createElement(GeometryLab,{workshop:"theorems"}));
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("/api/v1/practice-sets");
    expect(html).toContain("实时测量");
    expect(html).toContain("校验通过");
  });
});
