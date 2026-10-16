import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import { FreeGeometryEditor } from "../components/FreeGeometryEditor";

describe("自由几何编辑器可访问与无 DOM SSR",()=>{
 it("首屏应输出六个绘图工具、画布、对象列表及导入导出",()=>{
  const html=renderToStaticMarkup(createElement(FreeGeometryEditor));
  expect(html).toContain("自由几何编辑器");
  expect(html).toContain("直线");
  expect(html).toContain("线段");
  expect(html).toContain("交点");
  expect(html).toContain("圆");
  expect(html).toContain("移动 / 选择");
  expect(html).toContain("导出 JSON");
  expect(html).toContain("导出 SVG");
  expect(html).toContain("导入");
  expect(html).toContain("撤销");
  expect(html).toContain("对象属性");
  expect(html).toContain("对象列表");
  expect(html).toContain('viewBox="0 0 960 590"');
  expect(html).toContain("正式数学模拟题数据隔离");
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
 });
 it("自由几何编辑器没有模拟题的提交或修改 API",()=>{
  const html=renderToStaticMarkup(createElement(FreeGeometryEditor));
  expect(html).not.toContain('type="submit"');
  expect(html).not.toContain("/api/v1/practice");
  expect(html).not.toContain("/api/v1/wrong");
 });
});
