import { describe, expect, it } from "vitest";
import { renderCompositionHtml } from "../../src/render/composition.js";

describe("竖屏课程模板", () => {
  it("渲染 1080x1920 竖屏画布和底部唯一字幕区", () => {
    const html = renderCompositionHtml({
      id: "vertical-demo",
      title: "平行线的性质",
      format: "vertical",
    scenes: [{
        id: "scene-1",
        type: "summary",
        start: 0,
        duration: 5,
        narration: "先看一条平行线，猜猜角度会怎样变化。",
        mediaSrc: "manim/scene.mp4",
      }],
    });

    expect(html).toContain('width="1080" height="1920"');
    expect(html).toContain("aspect-ratio: 9 / 16");
    expect(html).toContain('class="subtitle subtitle--karaoke"');
    expect(html).toContain('class="clip manim-media"');
    expect(html).toContain('data-start="0" data-duration="5"');
    expect(html).not.toContain('class="narration"');
  });
});
