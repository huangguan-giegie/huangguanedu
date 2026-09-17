import { describe, expect, it } from 'vitest';
import {
  generateReviewReport,
  renderReviewReportHtml,
} from '../../src/render/review';
import { quadraticExtremumStoryboard } from '../../src/render/fixtures/quadratic-extremum';

describe('中文视频审查报告生成器', () => {
  it('reports empty scenes, missing audio and text overflow risk without blocking math warnings', () => {
    const report = generateReviewReport({
      ...quadraticExtremumStoryboard,
      scenes: [
        {
          id: 'empty',
          type: 'mistake',
          start: 0,
          duration: 1,
          subtitle: '这是一个很长很长很长很长很长很长很长很长很长很长很长很长很长的字幕',
        },
        {
          id: 'warning',
          type: 'equation-transform',
          start: 1,
          duration: 1,
          formula: 'x = 1',
          mathWarning: '请核对配方法符号',
        },
      ],
    });

    expect(report.summary.blocking).toBeGreaterThan(0);
    expect(report.findings.some((finding) => finding.code === 'EMPTY_SCENE')).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'MISSING_AUDIO')).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'TEXT_OVERFLOW_RISK')).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'MATH_WARNING' && finding.severity === 'warning')).toBe(true);
    expect(report.summary.blocking).not.toBe(report.findings.filter((finding) => finding.severity === 'warning').length);
  });

  it('renders review report as Chinese JSON-backed HTML', () => {
    const report = generateReviewReport(quadraticExtremumStoryboard);
    const html = renderReviewReportHtml(report);

    expect(html).toContain('视频审查报告');
    expect(html).toContain('数学警告');
    expect(html).toContain('JSON.stringify');
    expect(JSON.parse(report.json).storyboardId).toBe(quadraticExtremumStoryboard.id);
  });

  it('reports when the assembled timeline is far from the three-minute target', () => {
    const report = generateReviewReport({
      ...quadraticExtremumStoryboard,
      scenes: quadraticExtremumStoryboard.scenes.map((scene) => ({ ...scene, audio: { src: 'audio/test.wav', start: scene.start, duration: scene.duration } })),
    }, 180);

    expect(report.findings.some((finding) => finding.code === 'DURATION_OFF_TARGET')).toBe(true);
  });

  it('accepts a long-form example anywhere in the 150-195 second range', () => {
    const report = generateReviewReport({
      ...quadraticExtremumStoryboard,
      scenes: [{
        ...quadraticExtremumStoryboard.scenes[0],
        start: 0,
        duration: 180,
        audio: { src: 'audio/test.wav', start: 0, duration: 180 },
      }],
    }, 135);

    expect(report.findings.some((finding) => finding.code === 'DURATION_OFF_TARGET')).toBe(false);
  });
});
