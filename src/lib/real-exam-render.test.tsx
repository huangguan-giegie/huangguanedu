import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {RealExamAuthoringLab} from "../components/RealExamAuthoringLab";
import {GeometryLab} from "../components/GeometryLab";

describe("真题结构命题工作台 SSR与导航",()=>{
  it("默认显示中高考四组专题及动点可验证定值，包含可调参数和SVG图形",()=>{
    const html=renderToStaticMarkup(createElement(RealExamAuthoringLab));
    expect(html).toContain("真题结构驱动的数学命题实验室");
    expect(html).toContain("中考 · 相似三角形");
    expect(html).toContain("中考 · 二次函数");
    expect(html).toContain("高考 · 圆锥曲线");
    expect(html).toContain("高考 · 多直线定值");
    expect(html).toContain("基础 · 自由度实验");
    expect(html).toContain("DE/AD");
    expect(html).toContain("当前题设");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="number"');
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("数学命题实验室整合进几何工作台，不新增侧栏菜单",()=>{
    const html=renderToStaticMarkup(createElement(GeometryLab));
    expect(html).toContain("数学命题实验室");
    expect(html).toContain("自由作图工作台");
    expect(html).toContain("高考圆锥曲线");
  });
});
