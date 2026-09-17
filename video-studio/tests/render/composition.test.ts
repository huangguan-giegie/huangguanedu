import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  renderCompositionHtml,
  renderStoryboardHtml,
  type Storyboard,
} from '../../src/render/composition';
import { quadraticExtremumStoryboard } from '../../src/render/fixtures/quadratic-extremum';

describe('HyperFrames composition renderer', () => {
  it('保留可预览的模板资源并使用中文舞台文案', () => {
    const compositionTemplate = readFileSync(fileURLToPath(new URL('../../templates/composition.html', import.meta.url)), 'utf8');
    const reviewTemplate = readFileSync(fileURLToPath(new URL('../../templates/review-report.html', import.meta.url)), 'utf8');

    expect(compositionTemplate).toContain('{{COMPOSITION_BODY}}');
    expect(compositionTemplate).toContain('gsap.timeline({ paused: true })');
    expect(compositionTemplate).toContain('数学实验室');
    expect(compositionTemplate).not.toContain('HYPERFRAMES');
    expect(compositionTemplate).not.toContain('MATH LAB');
    expect(reviewTemplate).toContain('{{REPORT_JSON}}');
  });

  it('输出原创深色 16:9 舞台、中文标签和连续动画钩子', () => {
    const html = renderCompositionHtml({
      ...quadraticExtremumStoryboard,
      scenes: [
        {
          ...quadraticExtremumStoryboard.scenes[1],
          challenge: { badge: '先猜 3 秒', prompt: '最低点会落在哪里？', options: ['A. 0', 'B. -1', 'C. 3'] },
        },
        ...quadraticExtremumStoryboard.scenes.slice(0, 1),
        ...quadraticExtremumStoryboard.scenes.slice(2),
      ],
    });

    expect(html).toContain('width="1920" height="1080"');
    expect(html).toContain('data-composition-id="root"');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('aspect-ratio: 16 / 9');
    expect(html).toContain('数学实验室');
    expect(html).toContain('先猜 3 秒');
    expect(html).toContain('最低点会落在哪里？');
    expect(html).toContain('class="grid"');
    expect(html).toContain('class="curve"');
    expect(html).toContain('pathLength="1"');
    expect(html).toContain('class="vertex"');
    expect(html).toContain('class="projection"');
    expect(html).toContain('data-animation-hook="curve-morph"');
    expect(html).toContain('data-animation-hook="curve-tracer"');
    expect(html).toContain('attr: { d:');
    expect(html).toContain('attr: { cx:');
    expect(html).toContain('class="formula-callout"');
    expect(html).not.toContain('class="narration"');
    expect(html).toContain('公式揭示');
    expect(html).toContain('错误选项');
    expect(html).toContain('timeline.fromTo');
    expect(html).toContain('window.__timelines["root"]');
    expect(html).not.toContain('HYPERFRAMES');
    expect(html).not.toContain('MATH LAB');
    expect(html).not.toContain('coordinate-plane</span>');
    expect(html).not.toContain('solution-step</span>');
  });

  it('从分镜确定性生成 HTML 且不修改输入', () => {
    const storyboard: Storyboard = {
      id: 'demo',
      title: '函数演示',
      scenes: [{
        id: 'scene-1',
        type: 'summary',
        start: 0,
        duration: 2,
        subtitle: '结论',
        formula: 'y = x²',
      }],
    };
    const before = JSON.stringify(storyboard);

    expect(renderStoryboardHtml(storyboard)).toBe(renderStoryboardHtml(storyboard));
    expect(JSON.stringify(storyboard)).toBe(before);
  });

  it('样片抛物线在屏幕坐标中开口向上', () => {
    const scene = quadraticExtremumStoryboard.scenes.find((item) => item.type === 'function-curve');
    expect(scene?.points?.[0].y).toBeLessThan(scene?.points?.[2].y ?? 0);
    expect(scene?.points?.[4].y).toBeLessThan(scene?.points?.[2].y ?? 0);
  });

  it('解题场景在缺少公式时显示数学提醒', () => {
    const html = renderCompositionHtml({
      id: 'solution-demo',
      title: '最值',
      scenes: [{
        id: 'solution',
        type: 'solution-step',
        start: 0,
        duration: 2,
        subtitle: '分析最值',
        narration: '平方项永远大于等于 0。',
        mathWarning: '最小值为 -1',
      }],
    });

    expect(html).toContain('最小值为 -1');
    expect(html).toContain('公式揭示');
  });

  it('参数变化先完成曲线运动，再揭示结论标注', () => {
    const html = renderCompositionHtml({
      id: 'sweep-demo',
      title: '参数变化',
      scenes: [{
        id: 'sweep',
        type: 'parameter-sweep',
        start: 0,
        duration: 21,
        subtitle: '观察顶点移动',
        mathWarning: '顶点移动后再读出最值',
        points: quadraticExtremumStoryboard.scenes[1].points,
      }],
    });

    expect(html).toContain("timeline.fromTo('#sweep .formula-callout'");
    expect(html).toContain("}, 19.2);");
  });

  it('把公式化简步骤渲染成有顺序的公式长镜头', () => {
    const html = renderCompositionHtml({
      id: 'equation-demo',
      title: '配方法',
      scenes: [{
        id: 'derive',
        type: 'equation-transform',
        start: 0,
        duration: 24,
        narration: '我们一步一步完成配方。',
        equationSteps: [
          'y = x² - 4x + 3',
          '= x² - 4x + 4 - 4 + 3',
          '= (x - 2)² - 1',
          '因为 (x - 2)² ≥ 0',
          '所以 y ≥ -1',
        ],
      }],
    });

    expect(html).toContain('class="equation-steps"');
    expect(html).toContain('class="equation-step"');
    expect(html).toContain('data-animation-hook="equation-step-4"');
    expect(html).toContain('class="equation-index">1.</span>');
    expect(html).toContain("timeline.fromTo('#derive .equation-step:nth-child(1)'");
    expect(html).toContain('current-equation-step');
  });

  it('按旁白和真实场景时长生成底部逐字字幕', () => {
    const html = renderCompositionHtml({
      id: 'subtitle-demo',
      title: '字幕同步',
      scenes: [{
        id: 'speech',
        type: 'summary',
        start: 0,
        duration: 8,
        subtitle: '短标题',
        narration: '这是一段需要随着声音逐步出现的中文讲解。',
      }],
    });

    expect(html).toContain('class="subtitle subtitle--karaoke"');
    expect(html).toContain('data-subtitle-text=');
    expect(html).toContain("timeline.fromTo('#speech .subtitle-char'");
    expect(html).toContain('Noto Sans SC');
    expect(html).toContain('font-family: "Microsoft YaHei UI"');
    expect(html).toContain('font-family: "Noto Serif SC"');
    expect(html).not.toContain('font: 38px Georgia');
    expect(html).not.toContain('right: 28px');
  });

  it('带 Manim 媒体的场景不会被不透明兜底卡片遮挡', () => {
    const html = renderCompositionHtml({
      id: 'media-demo',
      title: '全等三角形',
      format: 'vertical',
      scenes: [{
        id: 'media-scene',
        type: 'challenge',
        start: 0,
        duration: 8,
        mediaSrc: 'manim/scene.mp4',
        challenge: { badge: '先猜三秒', prompt: '第5题', details: '正方形ABCD中，求证两条线垂直。' },
        narration: '先观察题目。',
      }],
    });

    expect(html).toContain('scene--has-media');
    expect(html).toContain('question-details');
    expect(html).toContain('.scene--has-media .scene-card { background: rgba(17,19,24,.22); }');
    expect(html).toContain('.scene--challenge .challenge-card {');
    expect(html).toContain('.scene--challenge .question-details {');
    expect(html).toContain('.root--has-global-media .scene--mistake .formula-card {');
    expect(html).toContain('.root--has-global-media .scene--solution-step .formula-card,');
  });

  it('多个场景共享一个全局 Manim 轨道，避免重复加载视频', () => {
    const html = renderCompositionHtml({
      id: 'global-media-demo',
      title: '几何动画',
      format: 'vertical',
      scenes: [
        { id: 'one', type: 'challenge', start: 0, duration: 4, mediaSrc: 'manim/scene.mp4', narration: '看题' },
        { id: 'two', type: 'summary', start: 4, duration: 6, mediaSrc: 'manim/scene.mp4', narration: '总结' },
      ],
    });

    expect(html).toContain('id="manim-global"');
    expect(html).toContain('data-duration="10.00"');
    expect(html).toContain('class="clip manim-media manim-global"');
    expect((html.match(/class="clip manim-media/g) ?? []).length).toBe(1);
  });

  it('清理题目卡片中的乱码占位符并压缩过长标题', () => {
    const html = renderCompositionHtml({
      id: 'text-cleanup',
      title: '中考冲刺：几何综合问题—巩固练习（提高）：全等三角形的判定与性质（SAS, AAS）',
      format: 'vertical',
      scenes: [{
        id: 'challenge',
        type: 'challenge',
        start: 0,
        duration: 8,
        challenge: { badge: '????', prompt: '?5?', details: '第5题：正方形ABCD中，求证两条线垂直。' },
        narration: '看题',
      }],
    });

    expect(html).toContain('全等三角形：判定方法');
    expect(html).toContain('先猜三秒');
    expect(html).toContain('第5题');
    expect(html).not.toContain('????');
    expect(html).not.toContain('?5?');
  });

  it('公式长镜头降低背景动画，解题卡片只保留极弱的几何提示', () => {
    const html = renderCompositionHtml({
      id: 'focus-demo',
      title: '几何例题',
      format: 'vertical',
      scenes: [
        { id: 'challenge', type: 'challenge', start: 0, duration: 4, mediaSrc: 'manim/scene.mp4', narration: '先看题目' },
        { id: 'proof', type: 'equation-transform', start: 4, duration: 12, mediaSrc: 'manim/scene.mp4', narration: '逐步证明', equationSteps: ['第一步', '第二步'] },
        { id: 'solution', type: 'solution-step', start: 16, duration: 10, mediaSrc: 'manim/scene.mp4', narration: '主解法' },
        { id: 'mistake', type: 'mistake', start: 26, duration: 4, mediaSrc: 'manim/scene.mp4', narration: '易错点' },
      ],
    });

    expect(html).toContain("timeline.to('#manim-global', { opacity: 0.24, duration: 0.35 }, 4.00);");
    expect(html).toContain("timeline.to('#manim-global', { opacity: 0.18, duration: 0.35 }, 16.00);");
    expect(html).toContain("timeline.to('#manim-global', { opacity: 0.07, duration: 0.35 }, 26.00);");
  });

  it('场景切换提前淡入，避免淡出后出现黑屏空档', () => {
    const html = renderCompositionHtml({
      id: 'transition-demo',
      title: '切换测试',
      format: 'vertical',
      scenes: [
        { id: 'first', type: 'summary', start: 0, duration: 5, narration: '第一段' },
        { id: 'second', type: 'summary', start: 5, duration: 5, narration: '第二段' },
      ],
    });

    expect(html).toContain("timeline.fromTo('#second', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 4.75);");
  });
});
