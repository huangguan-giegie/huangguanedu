import type { Storyboard } from '../composition';

export const quadraticExtremumStoryboard: Storyboard = {
  id: 'quadratic-extremum-demo',
  title: '二次函数的最值：从图像到顶点',
  scenes: [
    { id: 'plane', type: 'coordinate-plane', start: 0, duration: 2, subtitle: '先建立坐标平面', audio: { src: 'audio/plane.mp3', start: 0, duration: 2 } },
    { id: 'curve', type: 'function-curve', start: 2, duration: 3, subtitle: '观察开口向上的抛物线', formula: 'y = x² - 4x + 3', points: [{ x: 120, y: 160 }, { x: 260, y: 300 }, { x: 420, y: 400 }, { x: 600, y: 300 }, { x: 760, y: 160 }], audio: { src: 'audio/curve.mp3', start: 2, duration: 3 } },
    { id: 'transform', type: 'equation-transform', start: 5, duration: 3, subtitle: '配方后读出顶点', formula: 'y = (x - 2)² - 1', audio: { src: 'audio/transform.mp3', start: 5, duration: 3 } },
    { id: 'step', type: 'solution-step', start: 8, duration: 2, subtitle: '所以最小值在 x = 2 时取得', formula: 'y_min = -1', audio: { src: 'audio/step.mp3', start: 8, duration: 2 } },
    { id: 'mistake', type: 'mistake', start: 10, duration: 2, subtitle: '易错：把顶点横坐标当成最小值', formula: 'x = 2 ≠ y_min', audio: { src: 'audio/mistake.mp3', start: 10, duration: 2 } },
    { id: 'summary', type: 'summary', start: 12, duration: 2, subtitle: '结论：最小值是 -1', formula: '顶点 (2, -1)', audio: { src: 'audio/summary.mp3', start: 12, duration: 2 } },
  ],
};
