import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {JilinSquareExam} from "../components/JilinSquareExam";
import {VerifiedExamCasebook} from "../components/VerifiedExamCasebook";
import {RealExamAuthoringLab} from "../components/RealExamAuthoringLab";

describe("真实中高考案例的界面及旧命题功能兼容",()=>{
  it("默认展示吉林中考第19题的三问、可调条件和真实几何图",()=>{
    const html=renderToStaticMarkup(createElement(JilinSquareExam));
    expect(html).toContain("2025 吉林中考数学");
    expect(html).toContain("第19题");
    expect(html).toContain("第 1 问");
    expect(html).toContain("重叠面积 S");
    expect(html).toContain("分段");
    expect(html).toContain("<svg");
    expect(html).toContain('type="range"');
    expect(html).toContain('type="number"');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("另一个真题复盘包含吉林第22题与高考椭圆第2问",()=>{
    const html=renderToStaticMarkup(createElement(VerifiedExamCasebook));
    expect(html).toContain("2025 吉林中考数学");
    expect(html).toContain("2024 新高考Ⅰ卷");
    expect(html).toContain("真题的多问递进");
    expect(html).toContain("四问递进");
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("整体命题实验室首屏优先显示真题，但保留旧版自由创作工具",()=>{
    const html=renderToStaticMarkup(createElement(RealExamAuthoringLab));
    expect(html).toContain("真题 · 几何动点与相似");
    expect(html).toContain("真题复盘 · 多问综合");
    expect(html).toContain("中考 · 相似三角形");
    expect(html).toContain("高考 · 多直线定值");
  });
});
