import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdvancedPracticeDiagram } from "../components/AdvancedPracticeDiagram";
import { PracticeDiagram } from "../components/PracticeDiagram";
import type { AdvancedDiagram } from "./practice-advanced-diagram";

const samples: AdvancedDiagram[] = [
  {type:"circle_sector",radius:8,centralAngle:60,task:"ARC_LENGTH"},
  {type:"circle_inscribed_angle",centralAngle:100},
  {type:"circle_tangent",triple:"3-4-5"},
  {type:"circle_chord",triple:"5-12-13"},
  {type:"triangle_altitude",base:12,height:8,foot:"MIDDLE"},
  {type:"triangle_midline",base:14},
  {type:"quadratic_vertex",a:-1,h:2,k:3},
  {type:"linear_intersection",slopes:"1,-2",x:1,y:2},
  {type:"quadratic_line_intersection",roots:"-2,2",slope:1,intercept:-1},
];

describe("图形 SVG 渲染完整性", () => {
  it("九种高级图形均输出可访问、有限且闭合的 SVG", () => {
    for (const diagram of samples) {
      const html = renderToStaticMarkup(createElement(AdvancedPracticeDiagram,{diagram}));
      expect(html).toContain("<svg");
      expect(html).toContain('role="img"');
      expect(html).toContain("viewBox=");
      expect(html).toContain("<figcaption>");
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html).not.toContain("<script");
    }
  });

  it("单个练习题图保留题干给定条件并避免泄露待求的斜边", () => {
    const diagram = renderToStaticMarkup(createElement(PracticeDiagram, {
      diagram: {type:"right_triangle",triple:"3-4-5"},
    }));
    expect(diagram).toContain("3 cm");
    expect(diagram).toContain("4 cm");
    expect(diagram).not.toContain(">5 cm<");
    expect(diagram).toContain(">?</text>");
  });

  it("图形交点不因为同页多张图而复用 SVG clipPath ID", () => {
    const a = createElement(AdvancedPracticeDiagram,{diagram:samples[7]});
    const b = createElement(AdvancedPracticeDiagram,{diagram:samples[8]});
    const html = renderToStaticMarkup(createElement("section",null,a,b));
    const ids = Array.from(html.matchAll(/<clipPath id="([^"]+)"/g),m=>m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
