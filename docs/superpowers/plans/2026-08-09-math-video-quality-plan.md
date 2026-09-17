# 数学视频质量提升 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将二次函数样片改成约 3 分钟、中文单焦点、字幕随配音推进、公式逐步推导且没有黑屏的 HyperFrames 视频。

**Architecture:** 保持现有 `Lesson -> MiMo storyboard -> TTS -> HTML/SVG/GSAP -> HyperFrames` 流水线，不引入新的渲染依赖。扩展 storyboard 的公式步骤字段，由渲染器把每一步变成独立的公式行和高亮动画；音频绑定阶段以真实 WAV 时长重新压紧场景时间轴，字幕在每个场景内按旁白字符比例逐步显示。

**Tech Stack:** TypeScript、Zod、Vitest、SVG、GSAP、HyperFrames、FFmpeg/ffprobe。

## Global Constraints

- 所有可见文案使用中文；数学符号 `x`、`y`、数字和不等式保留为公式内容。
- 不复制 3Blue1Brown 的具体素材、Logo、片头或配色；只借鉴“一个视觉隐喻持续变化并服务于概念理解”的方法。
- 画面同时只保留一个主视觉焦点：公式长镜头居中，函数动画居中，字幕只在底部出现。
- 目标时长约 180 秒；场景之间不得存在未渲染的时间空档。
- 数学错误继续写入 review 报告，不用水印阻断出片。
- 任何生产代码修改都必须先有能失败的测试，并先运行该测试确认失败。

---

### Task 1: 扩展分镜公式步骤和更透彻的内容约束

**Files:**
- Modify: `video-studio/src/render/composition.ts`
- Modify: `video-studio/src/pipeline.ts`
- Modify: `video-studio/src/providers/mimo/planning.ts`
- Modify: `video-studio/lessons/quadratic-extrema.yaml`
- Test: `video-studio/tests/render/composition.test.ts`
- Test: `video-studio/tests/pipeline.test.ts`
- Test: `video-studio/tests/providers/mimo/mimo.test.ts`

**Interfaces:**
- `StoryboardScene` 新增可选 `equationSteps?: string[]`，每项是一行按顺序显示的公式。
- `normalizePlannerStoryboard()` 从 MiMo scene 的 `equationSteps` 或 `steps` 读取字符串数组并保留。
- MiMo 的 Zod schema 接受 `equationSteps`，系统提示要求公式场景至少给出完整变形链和原理解释。

- [ ] **Step 1: Write the failing tests**

在渲染测试中构造带 `equationSteps` 的 `equation-transform` scene，断言 HTML 同时包含公式行、步骤容器和逐步动画钩子；在 pipeline 测试中断言字段被规范化保留；在 MiMo 测试中断言请求提示包含“逐步化简”和 `equationSteps`。

- [ ] **Step 2: Run focused tests and verify they fail**

运行：`npm.cmd --prefix video-studio test -- tests/render/composition.test.ts tests/pipeline.test.ts tests/providers/mimo/mimo.test.ts`

预期：失败原因是当前 scene 类型没有 `equationSteps` 字段和逐步公式输出。

- [ ] **Step 3: Write the minimal implementation**

扩展类型、规范化和 MiMo schema；更新提示词，让脚本包含“现象—原理—代数步骤—中考题—易错点—总结”，并把二次函数样片的配方场景改为：

```yaml
equationSteps:
  - "y = x² - 4x + 3"
  - "= x² - 4x + 4 - 4 + 3"
  - "= (x - 2)² - 1"
  - "因为 (x - 2)² ≥ 0"
  - "所以 y ≥ -1，x = 2 时取得最小值 -1"
```

- [ ] **Step 4: Run focused tests and verify they pass**

运行同一条 focused test 命令，确认所有新增断言通过。

- [ ] **Step 5: Commit**

提交信息：`feat: add equation steps to math storyboard`

### Task 2: 字幕同步、字体和单焦点舞台

**Files:**
- Modify: `video-studio/src/render/composition.ts`
- Modify: `video-studio/templates/composition.html`
- Test: `video-studio/tests/render/composition.test.ts`

**Interfaces:**
- `renderCompositionHtml(storyboard)` 仍是唯一 HTML 入口。
- 场景字幕文本优先使用 `narration`，没有旁白时回退到 `subtitle`；只输出一个 `.subtitle` 元素。

- [ ] **Step 1: Write the failing tests**

断言生成 HTML 使用 `Noto Sans SC`/`Microsoft YaHei UI` 字体、包含字符级字幕数据和 GSAP 字幕推进时间轴；断言不存在 `.narration`，且公式浮层不再使用右上角定位。

- [ ] **Step 2: Run the focused render test and verify it fails**

运行：`npm.cmd --prefix video-studio test -- tests/render/composition.test.ts`

预期：失败，因为当前字幕是静态整句、公式使用右上角 callout，CSS 仍使用 Georgia。

- [ ] **Step 3: Write the minimal implementation**

增加安全的 HTML 字符转义和字幕分段渲染：把中文旁白切成短窗口，利用场景真实 duration 为每个字符/小句生成 `opacity` 与 `clip-path` 的时间轴；字幕始终固定底部、最多两行、不与公式重叠。替换为 Noto Sans SC 中文字体、Cambria/数学字体回退，并将公式场景改为居中的公式板。

- [ ] **Step 4: Run focused render tests and verify they pass**

运行：`npm.cmd --prefix video-studio test -- tests/render/composition.test.ts`。

- [ ] **Step 5: Commit**

提交信息：`feat: sync subtitles and refine math typography`

### Task 3: 公式长镜头和连续动画

**Files:**
- Modify: `video-studio/src/render/composition.ts`
- Modify: `video-studio/src/pipeline.ts`
- Test: `video-studio/tests/render/composition.test.ts`
- Test: `video-studio/tests/pipeline.test.ts`

**Interfaces:**
- `equationSteps` 每一步由渲染器生成 `.equation-step`，后续步骤不得一次性显示。
- 函数场景继续使用现有 `curve-morph`、`curve-tracer`、`vertex-projection` 钩子。

- [ ] **Step 1: Write the failing tests**

断言公式步骤包含顺序编号、逐行 reveal 时间轴和“当前步骤高亮”钩子；断言带音频的场景 start 严格等于上一个场景 end，不允许正间隙。

- [ ] **Step 2: Run tests and verify they fail**

运行：`npm.cmd --prefix video-studio test -- tests/render/composition.test.ts tests/pipeline.test.ts`。

- [ ] **Step 3: Write the minimal implementation**

为公式板增加长镜头布局和 GSAP 顺序动画：每行先出现，再高亮新增项、移动同类项、显示等号关系，最后强调 `≥ 0` 和最小值；音频绑定时用 `start = cursor` 压紧场景，令 TTS 的真实 duration 驱动后续时间。

- [ ] **Step 4: Run focused tests and verify they pass**

运行同一条 focused test 命令并确认通过。

- [ ] **Step 5: Commit**

提交信息：`fix: remove storyboard gaps and animate equation derivation`

### Task 4: 生成、渲染和视觉验收

**Files:**
- Generated: `video-studio/runs/quadratic-extrema/preview/index.html`
- Generated: `video-studio/runs/quadratic-extrema/storyboard.json`
- Generated: `video-studio/runs/quadratic-extrema/render/quadratic-extrema.mp4`
- Generated: `video-studio/runs/quadratic-extrema/review/report.json`

- [ ] **Step 1: Run the complete video-studio test and typecheck suites**

运行：`npm.cmd --prefix video-studio test` 和 `npm.cmd --prefix video-studio run typecheck`。

- [ ] **Step 2: Generate a new preview with the provided voice sample**

使用 `C:\Users\huangguan\Desktop\huangguanedu\.worktrees\cloudbase-miniapp\miniprogram\template_mp3\temple.mp3` 和 `MIMO_API_KEY`，重新生成 `quadratic-extrema` 的 storyboard、分段 WAV 和 review 报告。

- [ ] **Step 3: Validate and render with HyperFrames**

运行 HyperFrames check；确认 errors 为 0 后渲染 MP4。使用 ffprobe 检查 1920×1080、30fps、存在音频、时长接近 180 秒。

- [ ] **Step 4: Inspect representative frames**

抽取开场、函数曲线中段、配方每一步、易错点和结尾帧，确认无黑屏、公式步骤不是一次性显示、字幕只在底部且中文不溢出。

- [ ] **Step 5: Run root regression checks**

运行根目录 `npm.cmd test`、`npm.cmd run lint` 和 `npm.cmd run build`，确认现有 Next.js 教学平台没有回归。

- [ ] **Step 6: Commit generated implementation changes**

提交信息：`feat: improve quadratic math video quality`
