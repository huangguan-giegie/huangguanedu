# 连续函数动画与单焦点字幕 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有固定函数图改为连续 SVG/GSAP 动画，并移除顶部旁白造成的字幕层冲突。

**Architecture:** 只修改 `video-studio` 的渲染模型和 HTML 生成器。每个函数场景由确定性的路径关键帧、追踪点关键帧和顶点投影关键帧组成；输入 storyboard 和音频接口保持不变，因此无需重新调用 MiMo 或 TTS 即可重渲染已有样片。

**Tech Stack:** TypeScript、Vitest、SVG、GSAP、HyperFrames。

## Global Constraints

- 所有可见文案使用中文；数学公式中的 `x`、`y` 保留为数学符号。
- 不复制 3Blue1Brown 的具体素材、Logo 或片头，只借鉴“一个视觉隐喻持续变形”的讲解方法。
- 使用现有 HyperFrames 时间轴，不新增渲染依赖。
- 先写失败测试，再写最小实现。

---

### Task 1: 函数场景生成动态关键帧

**Files:**
- Modify: `video-studio/src/render/composition.ts`
- Test: `video-studio/tests/render/composition.test.ts`

**Interfaces:**
- `renderCompositionHtml(storyboard: Storyboard): string` 继续作为唯一 HTML 入口。
- 新增的内部路径/关键帧函数只接收现有 `StoryboardScene`，不改变外部 storyboard JSON。

- [ ] **Step 1: Write the failing test**

在 `composition.test.ts` 中增加断言：函数 HTML 包含 `curve-morph`、`curve-tracer`、`vertex-projection` 的动画钩子，并包含 GSAP `attr` 路径变形和追踪点属性动画。

- [ ] **Step 2: Run test to verify it fails**

运行：`npx.cmd vitest run tests/render/composition.test.ts`

预期：失败，因为当前 HTML 只有固定 `.curve` 描边、没有路径变形和追踪点。

- [ ] **Step 3: Write minimal implementation**

增加与当前点集等长的基线/最终/参数变体路径；渲染 `.curve-morph`、`.curve-tracer`、`.vertex` 和 `.projection`。时间轴在场景开始后依次执行：

```ts
timeline.fromTo(selector, { attr: { d: baselinePath } }, { attr: { d: finalPath }, duration: 2.2 }, start + 0.3);
timeline.to(tracer, { attr: { cx, cy }, duration: 1.4, ease: 'power1.inOut' }, start + 2.6);
timeline.fromTo(projection, { opacity: 0 }, { opacity: 1, duration: 0.6 }, start + 4.0);
```

对 `parameter-sweep` 追加至少两组同构路径和顶点位置，让曲线形态与顶点同时变化。

- [ ] **Step 4: Run test to verify it passes**

运行：`npx.cmd vitest run tests/render/composition.test.ts`

预期：所有 composition 测试通过。

### Task 2: 重排字幕与公式层级

**Files:**
- Modify: `video-studio/src/render/composition.ts`
- Modify: `video-studio/templates/composition.html`
- Test: `video-studio/tests/render/composition.test.ts`

**Interfaces:**
- `StoryboardScene.narration` 仍用于配音，不再输出为可见 `.narration` 元素。
- `subtitle` 保持底部唯一字幕来源。

- [ ] **Step 1: Write the failing test**

增加断言：生成 HTML 不包含 `<div class="narration">`，包含底部 `.subtitle`，并包含公式标注的非居中定位类。

- [ ] **Step 2: Run test to verify it fails**

运行：`npx.cmd vitest run tests/render/composition.test.ts`

预期：失败，因为当前 HTML 输出 `.narration`，公式卡片也处于视觉中心。

- [ ] **Step 3: Write minimal implementation**

移除 `renderScene` 中的可见 narration 输出；将函数公式卡片改为 `.formula-callout`，通过 SVG/舞台相对定位靠近顶点或图形右上侧；底部字幕限制为单行短句并设置安全边距。

- [ ] **Step 4: Run test to verify it passes**

运行：`npx.cmd vitest run tests/render/composition.test.ts`

预期：所有 composition 测试通过。

### Task 3: 重新生成并验收样片

**Files:**
- Generated: `video-studio/runs/quadratic-extrema/preview/index.html`
- Generated: `video-studio/runs/quadratic-extrema/render/quadratic-extrema.mp4`
- Generated: `video-studio/runs/quadratic-extrema/review/report.json`

- [ ] **Step 1: Run focused and full tests**

运行：`npm.cmd test` 和 `npm.cmd run typecheck`（工作目录 `video-studio`）。

- [ ] **Step 2: Rebuild preview without new API calls**

运行：`npm.cmd run video:preview -- --id quadratic-extrema`。

- [ ] **Step 3: Run HyperFrames validation and render**

运行：`npx.cmd --no-install hyperframes check video-studio/runs/quadratic-extrema/preview`，然后使用现有 FFmpeg 环境运行 `npm.cmd run video:render -- --id quadratic-extrema`。

- [ ] **Step 4: Inspect keyframes and metadata**

抽取函数场景前、中、后关键帧，确认曲线、追踪点和投影线发生变化；用 `ffprobe` 确认 1920×1080、30fps 和音频时长存在。
