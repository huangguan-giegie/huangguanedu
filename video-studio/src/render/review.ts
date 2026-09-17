import type { Storyboard, StoryboardScene } from './composition';

export type FindingSeverity = 'error' | 'warning';
export interface ReviewFinding { code: string; severity: FindingSeverity; sceneId?: string; message: string; field?: string; }
export interface ReviewReport {
  storyboardId: string;
  durationSeconds: number;
  targetDurationSeconds?: number;
  summary: { total: number; blocking: number; warnings: number };
  findings: ReviewFinding[];
  json: string;
}

const hasVisualPayload = (scene: StoryboardScene): boolean => Boolean(scene.formula || scene.narration || scene.points?.length);

export const generateReviewReport = (storyboard: Storyboard, targetDurationSeconds?: number): ReviewReport => {
  const findings: ReviewFinding[] = [];
  for (const scene of storyboard.scenes) {
    if (!hasVisualPayload(scene)) findings.push({ code: 'EMPTY_SCENE', severity: 'error', sceneId: scene.id, message: '场景没有可渲染的公式、讲解或图形数据。' });
    if (!scene.audio) findings.push({ code: 'MISSING_AUDIO', severity: 'error', sceneId: scene.id, message: '场景缺少音频轨道。' });
    if ((scene.subtitle?.length ?? 0) > 32) findings.push({ code: 'TEXT_OVERFLOW_RISK', severity: 'warning', sceneId: scene.id, field: 'subtitle', message: '中文字幕超过 32 个字符，存在溢出风险。' });
    if (scene.mathWarning) findings.push({ code: 'MATH_WARNING', severity: 'warning', sceneId: scene.id, message: scene.mathWarning });
  }
  const durationSeconds = storyboard.scenes.reduce(
    (latest, scene) => Math.max(latest, (scene.audio?.start ?? scene.start) + (scene.audio?.duration ?? scene.duration)),
    0,
  );
  const acceptedMinimum = targetDurationSeconds ? Math.max(60, targetDurationSeconds - 15) : undefined;
  const acceptedMaximum = targetDurationSeconds ? Math.min(195, targetDurationSeconds + 15) : undefined;
  const isAcceptedLongForm = durationSeconds >= 150 && durationSeconds <= 195;
  if (targetDurationSeconds && acceptedMinimum !== undefined && acceptedMaximum !== undefined
    && !isAcceptedLongForm && (durationSeconds < acceptedMinimum || durationSeconds > acceptedMaximum)) {
    findings.push({
      code: 'DURATION_OFF_TARGET',
      severity: 'warning',
      message: `当前时间轴约 ${durationSeconds.toFixed(1)} 秒，目标为 ${targetDurationSeconds} 秒，请检查配音内容或分镜节奏。`,
    });
  }
  const blocking = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const report = { storyboardId: storyboard.id, durationSeconds, targetDurationSeconds, summary: { total: findings.length, blocking, warnings }, findings };
  return { ...report, json: JSON.stringify(report, null, 2) };
};

export const renderReviewReportHtml = (report: ReviewReport): string => `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>视频审查报告</title><style>body{margin:0;padding:40px;background:#08111f;color:#e5eefc;font-family:"Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;background:#111c2e;padding:32px;border-radius:20px}h1{color:#7dd3fc}.error{color:#fb7185}.warning{color:#facc15}li{margin:12px 0}</style></head>
<body><main><h1>视频审查报告</h1><p>阻断问题：${report.summary.blocking}　数学警告：${report.summary.warnings}</p><ul>${report.findings.map((finding) => `<li class="${finding.severity}"><strong>${finding.code}</strong>：${finding.message}${finding.sceneId ? `（${finding.sceneId}）` : ''}</li>`).join('')}</ul><script type="application/json" id="review-json">${report.json}</script><script>const reviewReport = JSON.stringify(${JSON.stringify(report)});</script></main></body></html>`;
