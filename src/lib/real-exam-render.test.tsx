import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {RealExamAuthoringLab} from "../components/RealExamAuthoringLab";
import {GeometryLab} from "../components/GeometryLab";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));

describe("真题结构命题工作台 SSR与导航",()=>{
  it("默认显示本地卷真题，保留中高考四组自由命题专题",()=>{
    const html=renderToStaticMarkup(createElement(RealExamAuthoringLab));
    expect(html).toContain("武汉中考 · 湖北高考");
    expect(html).toContain("中考 · 相似三角形");
    expect(html).toContain("中考 · 二次函数");
    expect(html).toContain("高考 · 圆锥曲线");
    expect(html).toContain("高考 · 多直线定值");
    expect(html).toContain("基础 · 自由度实验");
    expect(html).toContain("DH=GH");
    expect(html).toContain("原题约束检查");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="number"');
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("数学命题实验室整合进几何工作台，不新增侧栏菜单",()=>{
    const html=renderToStaticMarkup(createElement(GeometryLab));
    expect(html).toContain("真题探究");
    expect(html).toContain("自由作图");
    expect(html).toContain("圆锥曲线");
  });
});
