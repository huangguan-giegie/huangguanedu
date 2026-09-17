export type SceneType =
  | 'coordinate-plane'
  | 'function-curve'
  | 'parameter-sweep'
  | 'equation-transform'
  | 'solution-step'
  | 'mistake'
  | 'summary'
  | 'challenge';

export type CompositionFormat = 'landscape' | 'vertical';

export interface SceneAudio { src: string; start: number; duration: number; }

export interface SceneChallenge {
  badge?: string;
  prompt?: string;
  details?: string;
  options?: string[];
}

export interface StoryboardScene {
  id: string;
  type: SceneType;
  start: number;
  duration: number;
  subtitle?: string;
  formula?: string;
  equationSteps?: string[];
  narration?: string;
  audio?: SceneAudio;
  points?: Array<{ x: number; y: number }>;
  mathWarning?: string;
  challenge?: SceneChallenge;
  mediaSrc?: string;
}

export interface Storyboard {
  id: string;
  title: string;
  scenes: StoryboardScene[];
  format?: CompositionFormat;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

const chineseMathText = (value: string): string => value
  .replace(/\bSAS\b/gi, '边角边')
  .replace(/\bAAS\b/gi, '角角边')
  .replace(/\bASA\b/gi, '角边角')
  .replace(/\bSSS\b/gi, '边边边')
  .replace(/\bHL\b/gi, '斜边直角边');

const compactDisplayTitle = (value: string): string => {
  const normalized = chineseMathText(value).trim();
  const subject = normalized.match(/(?:巩固练习（提高）|知识讲解（提高）)[：:]\s*(.+)$/u)?.[1]
    ?? normalized.replace(/^中考冲刺[：:]\s*/u, '');
  if (/全等三角形/u.test(subject)) return '全等三角形：判定方法';
  if (subject.length <= 34) return subject;
  return `${Array.from(subject).slice(0, 33).join('')}…`;
};

const isBrokenVisibleText = (value: string): boolean => /^(?:\?+|\?*\d+\?+|�+)$/u.test(value.trim());

const safeChallengeText = (value: string | undefined, fallback: string): string => {
  const text = value?.trim() ?? '';
  return text && !isBrokenVisibleText(text) ? chineseMathText(text) : fallback;
};

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const sceneLabels: Record<SceneType, string> = {
  'coordinate-plane': '坐标平面',
  'function-curve': '函数曲线',
  'parameter-sweep': '参数变化',
  'equation-transform': '公式变形',
  'solution-step': '公式揭示',
  mistake: '易错选项',
  summary: '方法总结',
  challenge: '先猜一猜',
};

const gridPath = (): string => {
  const vertical = Array.from({ length: 9 }, (_, index) => `M ${80 + index * 100} 40 V 480`);
  const horizontal = Array.from({ length: 5 }, (_, index) => `M 80 ${80 + index * 100} H 880`);
  return [...vertical, ...horizontal].join(' ');
};

const curvePath = (points: Array<{ x: number; y: number }>): string => {
  if (points.length < 2) return '';
  const segments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return `Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  });
  const last = points[points.length - 1];
  return `M ${points[0].x} ${points[0].y} ${segments.join(' ')} Q ${last.x} ${last.y} ${last.x} ${last.y}`;
};

const translatePoints = (points: Array<{ x: number; y: number }>, dx: number, dy: number): Array<{ x: number; y: number }> =>
  points.map((point) => ({ x: point.x + dx, y: point.y + dy }));

const baselinePoints = (points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> =>
  points.map((point) => ({ x: point.x, y: 260 }));

const curveVertex = (points: Array<{ x: number; y: number }>): { x: number; y: number } =>
  points.reduce((lowest, point) => point.y > lowest.y ? point : lowest, points[0] ?? { x: 480, y: 260 });

const projectionPath = (point: { x: number; y: number }): string =>
  `M${point.x} ${point.y} V260 M${point.x} ${point.y} H480`;

const jsString = (value: string): string => JSON.stringify(value);

const subtitleText = (scene: StoryboardScene): string => scene.narration?.trim() || scene.subtitle?.trim() || '';

const renderSubtitle = (scene: StoryboardScene): string => {
  const text = chineseMathText(subtitleText(scene));
  const characters = Array.from(text).map((character, index) =>
    `<span class="subtitle-char" data-char-index="${index}">${escapeHtml(character)}</span>`).join('');
  return `<div class="subtitle subtitle--karaoke" data-subtitle-text="${escapeHtml(text)}">${characters}</div>`;
};

const renderEquationSteps = (scene: StoryboardScene): string => {
  const steps = scene.equationSteps?.length ? scene.equationSteps : [scene.formula ?? scene.mathWarning ?? ''];
  return `<div class="equation-steps" data-animation-hook="equation-steps">${steps.map((step, index) =>
    `<div class="equation-step" data-animation-hook="equation-step-${index + 1}" data-step-index="${index}">
      <span class="equation-index">${index + 1}.</span><span class="formula">${escapeHtml(chineseMathText(step))}</span>
    </div>`).join('')}</div>`;
};

const renderChallenge = (challenge?: SceneChallenge): string => {
  if (!challenge) return '';
  const details = challenge.details ? chineseMathText(challenge.details) : '';
  const inferredPrompt = details.match(/^第\d+题/u)?.[0];
  const options = challenge.options?.map((option, index) =>
    `<span class="option ${index === 1 ? 'option-wrong' : ''}">${escapeHtml(chineseMathText(option))}</span>`).join('') ?? '';
  return `<div class="challenge-card" data-animation-hook="challenge-reveal">
    <div class="challenge-badge">${escapeHtml(safeChallengeText(challenge.badge, '先猜三秒'))}</div>
    ${challenge.prompt || inferredPrompt ? `<div class="challenge-prompt">${escapeHtml(safeChallengeText(challenge.prompt, inferredPrompt ?? '先看题目'))}</div>` : ''}
    ${details ? `<div class="question-details">${escapeHtml(details)}</div>` : ''}
    ${options ? `<div class="options">${options}</div>` : ''}
  </div>`;
};

const renderGraph = (scene: StoryboardScene): string => {
  const points = scene.points ?? [];
  const path = curvePath(points);
  const vertex = curveVertex(points);
  const graph = scene.type === 'function-curve' || scene.type === 'parameter-sweep';
  const animatedGraph = graph && path;
  return `<div class="visual-stack">${renderChallenge(scene.challenge)}<svg class="math-svg" viewBox="0 0 960 520" aria-label="${sceneLabels[scene.type]}">
    <path class="grid" data-animation-hook="grid-draw" pathLength="1" d="${gridPath()}" />
    <path class="axis" data-animation-hook="axis-draw" pathLength="1" d="M80 260 H900 M480 40 V480" />
    ${animatedGraph ? `<path class="curve" data-animation-hook="curve-morph" pathLength="1" d="${escapeHtml(path)}" />
    <path class="projection" data-animation-hook="vertex-projection" pathLength="1" d="${projectionPath(vertex)}" />
    <circle class="vertex" data-animation-hook="vertex-pulse" cx="${vertex.x}" cy="${vertex.y}" r="12" />
    <circle class="curve-tracer" data-animation-hook="curve-tracer" cx="${points[0].x}" cy="${points[0].y}" r="10" />` : '<circle class="origin" cx="480" cy="260" r="6" />'}
  </svg>${scene.formula || scene.mathWarning ? `<div class="formula-callout" data-animation-hook="formula-callout"><div class="formula">${escapeHtml(chineseMathText(scene.formula ?? scene.mathWarning ?? ''))}</div></div>` : ''}</div>`;
};

const renderSceneVisual = (scene: StoryboardScene): string => {
  if (scene.type === 'coordinate-plane' || scene.type === 'function-curve' || scene.type === 'parameter-sweep') return renderGraph(scene);
  if (scene.type === 'equation-transform' && (scene.equationSteps?.length || scene.formula || scene.mathWarning)) {
    return `<div class="scene-card scene-card--equation-transform formula-stage" data-animation-hook="formula-reveal">
      <span class="scene-label">${sceneLabels[scene.type]}</span>${renderEquationSteps(scene)}
    </div>`;
  }
  const formula = scene.formula ?? scene.mathWarning;
  const warning = scene.type === 'mistake' ? '<span class="option-wrong wrong-label" data-animation-hook="wrong-option">错误选项</span>' : '';
  return `<div class="scene-card scene-card--${scene.type}" data-animation-hook="${scene.type === 'mistake' ? 'wrong-option' : 'formula-reveal'}">
    <span class="scene-label">${sceneLabels[scene.type]}</span>${renderChallenge(scene.challenge)}${warning}${formula ? `<div class="formula-card"><div class="formula">${escapeHtml(chineseMathText(formula))}</div></div>` : ''}
  </div>`;
};

const renderScene = (scene: StoryboardScene, useGlobalMedia = false): string => {
  const id = safeId(scene.id);
  const audio = scene.audio ? `<audio id="audio-${id}" data-start="${scene.audio.start}" data-duration="${scene.audio.duration}" src="${escapeHtml(scene.audio.src)}"></audio>` : '';
  const media = scene.mediaSrc && !useGlobalMedia ? `<video id="manim-${id}" class="clip manim-media" src="${escapeHtml(scene.mediaSrc)}" data-start="${scene.start}" data-duration="${scene.duration}" playsinline muted></video>` : '';
  const mediaClass = scene.mediaSrc || useGlobalMedia ? ' scene--has-media' : '';
  return `<section id="${id}" class="clip scene scene--${scene.type}${mediaClass}" data-scene-type="${scene.type}" data-animation-hook="${sceneLabels[scene.type]}" data-track-index="0">
    <div class="scene-visual">${media}${renderSceneVisual(scene)}</div>
    ${renderSubtitle(scene)}
    ${audio}
  </section>`;
};

const globalMediaOpacity = (type: SceneType): number => {
  if (type === 'equation-transform') return 0.24;
  if (type === 'mistake') return 0.07;
  if (type === 'solution-step') return 0.18;
  if (type === 'summary') return 0.24;
  if (type === 'challenge') return 0.72;
  return 0.86;
};

const renderTimeline = (scene: StoryboardScene, useGlobalMedia = false): string => {
  const id = safeId(scene.id); const start = scene.start;
  const enterStart = Math.max(0, start - 0.25);
  const steps = [`timeline.fromTo('#${id}', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, ${enterStart.toFixed(2)});`];
  if (useGlobalMedia) {
    steps.push(`timeline.to('#manim-global', { opacity: ${globalMediaOpacity(scene.type)}, duration: 0.35 }, ${start.toFixed(2)});`);
  }
  const fadeOutStart = Math.max(start + 0.45, start + scene.duration - 0.25);
  steps.push(`timeline.to('#${id}', { autoAlpha: 0, duration: 0.25, ease: 'power1.inOut' }, ${fadeOutStart.toFixed(2)});`);
  const isGraph = scene.type === 'coordinate-plane' || scene.type === 'function-curve' || scene.type === 'parameter-sweep';
  if (isGraph) {
    steps.push(`timeline.fromTo('#${id} .grid, #${id} .axis', { strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, duration: 0.9, ease: 'power1.inOut' }, ${start});`);
  }
  if (scene.points && scene.points.length > 1 && (scene.type === 'function-curve' || scene.type === 'parameter-sweep')) {
    const points = scene.points;
    const finalPath = curvePath(points);
    const basePath = curvePath(baselinePoints(points));
    const finalVertex = curveVertex(points);
    const walkPoints = [...points, ...points.slice(1, -1).reverse(), ...points.slice(1)];
    steps.push(`timeline.fromTo('#${id} .curve', { attr: { d: ${jsString(basePath)} }, opacity: 0.7 }, { attr: { d: ${jsString(finalPath)} }, opacity: 1, duration: 2.2, ease: 'power2.inOut' }, ${start + 0.3});`);
    steps.push(`timeline.fromTo('#${id} .projection', { attr: { d: ${jsString(projectionPath({ x: points[0].x, y: 260 }))} }, opacity: 0 }, { attr: { d: ${jsString(projectionPath(finalVertex))} }, opacity: 1, duration: 0.7, ease: 'power1.inOut' }, ${start + 5.8});`);
    steps.push(`timeline.fromTo('#${id} .vertex', { attr: { cx: ${points[0].x}, cy: 260 }, scale: 0.6, transformOrigin: 'center', opacity: 0 }, { attr: { cx: ${finalVertex.x}, cy: ${finalVertex.y} }, scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.8)' }, ${start + 5.8});`);
    steps.push(`timeline.fromTo('#${id} .curve-tracer', { attr: { cx: ${points[0].x}, cy: 260 }, opacity: 0 }, { attr: { cx: ${points[0].x}, cy: ${points[0].y} }, opacity: 1, duration: 0.45, ease: 'power1.out' }, ${start + 2.7});`);
    walkPoints.slice(1).forEach((point, index) => {
      steps.push(`timeline.to('#${id} .curve-tracer', { attr: { cx: ${point.x}, cy: ${point.y} }, duration: 0.5, ease: 'power1.inOut' }, ${start + 3.2 + index * 0.55});`);
    });
    steps.push(`timeline.to('#${id} .curve-tracer', { scale: 1.35, opacity: 0.45, duration: 0.35, repeat: 3, yoyo: true, ease: 'sine.inOut' }, ${start + 7.7});`);
    if (scene.type === 'parameter-sweep') {
      const variantA = translatePoints(points, -50, -28);
      const variantB = translatePoints(points, 50, 30);
      const vertexA = curveVertex(variantA);
      const vertexB = curveVertex(variantB);
      steps.push(`timeline.to('#${id} .curve', { attr: { d: ${jsString(curvePath(variantA))} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 8.7});`);
      steps.push(`timeline.to('#${id} .vertex', { attr: { cx: ${vertexA.x}, cy: ${vertexA.y} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 8.7});`);
      steps.push(`timeline.to('#${id} .projection', { attr: { d: ${jsString(projectionPath(vertexA))} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 8.7});`);
      steps.push(`timeline.to('#${id} .curve', { attr: { d: ${jsString(curvePath(variantB))} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 12.4});`);
      steps.push(`timeline.to('#${id} .vertex', { attr: { cx: ${vertexB.x}, cy: ${vertexB.y} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 12.4});`);
      steps.push(`timeline.to('#${id} .projection', { attr: { d: ${jsString(projectionPath(vertexB))} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 12.4});`);
      steps.push(`timeline.to('#${id} .curve', { attr: { d: ${jsString(finalPath)} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 16.1});`);
      steps.push(`timeline.to('#${id} .vertex', { attr: { cx: ${finalVertex.x}, cy: ${finalVertex.y} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 16.1});`);
      steps.push(`timeline.to('#${id} .projection', { attr: { d: ${jsString(projectionPath(finalVertex))} }, duration: 3.2, ease: 'power1.inOut' }, ${start + 16.1});`);
    }
  }
  const isEquationStage = scene.type === 'equation-transform' && (scene.equationSteps?.length || scene.formula || scene.mathWarning);
  if (isEquationStage) {
    const stepCount = scene.equationSteps?.length ?? 1;
    const stepDuration = Math.max(1.2, Math.min(5.2, (scene.duration - 2.2) / stepCount));
    for (let index = 0; index < stepCount; index += 1) {
      const stepStart = start + 0.8 + index * stepDuration;
      const selector = `#${id} .equation-step:nth-child(${index + 1})`;
      steps.push(`timeline.fromTo('${selector}', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, ${stepStart.toFixed(2)});`);
      steps.push(`timeline.to('${selector}', { className: '+=current-equation-step', duration: 0.12 }, ${(stepStart + 0.55).toFixed(2)});`);
      if (index > 0) {
        const previousSelector = `#${id} .equation-step:nth-child(${index})`;
        steps.push(`timeline.to('${previousSelector}', { className: '-=current-equation-step', duration: 0.12 }, ${stepStart.toFixed(2)});`);
      }
    }
  } else if (scene.formula || scene.mathWarning) {
    const formulaSelector = isGraph ? '.formula-callout' : '.formula-card';
    const formulaDelay = scene.type === 'parameter-sweep' ? 19.2 : isGraph ? 8.2 : 1.55;
    steps.push(`timeline.fromTo('#${id} ${formulaSelector}', { clipPath: 'inset(0 100% 0 0)', opacity: 0 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.75, ease: 'power2.out' }, ${start + formulaDelay});`);
  }
  const narration = subtitleText(scene);
  if (narration) {
    steps.push(`timeline.fromTo('#${id} .subtitle-char', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.08, ease: 'power1.out', stagger: ${(Math.max(0.8, scene.duration - 0.8) / Math.max(1, Array.from(narration).length)).toFixed(3)} }, ${(start + 0.18).toFixed(2)});`);
  }
  if (scene.challenge) {
    steps.push(`timeline.fromTo('#${id} .challenge-badge', { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' }, ${start + 0.05});`);
  }
  if (scene.type === 'mistake') {
    steps.push(`timeline.fromTo('#${id} .option-wrong', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.4)' }, ${start + 1.8});`);
  }
  return steps.join('\n    ');
};

export const renderCompositionHtml = (storyboard: Storyboard): string => {
  const mediaScene = storyboard.scenes.find((scene) => scene.mediaSrc);
  const useGlobalMedia = storyboard.scenes.filter((scene) => scene.mediaSrc).length > 1;
  const totalDuration = storyboard.scenes.reduce((max, scene) => Math.max(max, scene.start + scene.duration), 0);
  const globalMedia = useGlobalMedia && mediaScene?.mediaSrc
    ? `<video id="manim-global" class="clip manim-media manim-global" src="${escapeHtml(mediaScene.mediaSrc)}" data-start="0" data-duration="${totalDuration.toFixed(2)}" data-track-index="0" playsinline muted loop></video>`
    : '';
  const scenes = storyboard.scenes.map((scene) => renderScene(scene, useGlobalMedia)).join('\n');
  const timeline = storyboard.scenes.map((scene) => renderTimeline(scene, useGlobalMedia)).join('\n    ');
  const isVertical = storyboard.format === 'vertical';
  const width = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;
  const fps = 24;
  const stageCss = isVertical
    ? `#root { width: 1080px; height: 1920px; aspect-ratio: 9 / 16; position: relative; overflow: hidden; background: radial-gradient(circle at 50% 42%, #17191d 0, var(--stage) 58%, #030405 100%); }
  .eyebrow { top: 38px; left: 42px; font-size: 14px; letter-spacing: .1em; } .title { top: 68px; left: 42px; right: 42px; font-size: 36px; line-height: 1.2; }
  .scene { inset: 190px 28px 180px; padding: 24px; border-radius: 22px; } .scene-visual, .visual-stack { height: 1260px; } .formula { font-size: 31px; } .formula-stage { gap: 16px; } .equation-steps { width: 96%; padding: 14px 18px; gap: 8px; } .equation-step { grid-template-columns: 40px 1fr; min-height: 58px; padding: 5px 10px; } .equation-step .formula { font-size: 31px; } .challenge-card { min-width: 0; width: 96%; } .challenge-prompt { font-size: 30px; } .options { flex-wrap: wrap; justify-content: center; } .option { font-size: 24px; }
  .subtitle { left: 34px; right: 34px; bottom: 50px; min-height: 112px; padding: 8px 14px; font-size: 28px; } .question-details { max-height: 520px; padding: 18px 20px; font-size: 25px; line-height: 1.55; }`
    : `#root { width: 1920px; height: 1080px; aspect-ratio: 16 / 9; position: relative; overflow: hidden; background: radial-gradient(circle at 50% 44%, #17191d 0, var(--stage) 58%, #030405 100%); }`;
  const displayTitle = compactDisplayTitle(storyboard.title);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(displayTitle)}</title>
<style>
  :root { color-scheme: dark; --ink: #f4eee4; --muted: #a9a39b; --coral: #ff8066; --blue: #78a9ff; --stage: #090a0d; --line: #33363d; }
  * { box-sizing: border-box; } @font-face { font-family: "Noto Sans SC"; src: local("Noto Sans SC"), local("Noto Sans CJK SC"); } @font-face { font-family: "Noto Serif SC"; src: local("Noto Serif SC"); } @font-face { font-family: "Microsoft YaHei UI"; src: local("Microsoft YaHei UI"); } @font-face { font-family: "Microsoft YaHei"; src: local("Microsoft YaHei"); }
  body { margin: 0; background: #030405; color: var(--ink); font-family: "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif; } .clip { visibility: hidden; }
  .eyebrow { position: absolute; top: 54px; left: 96px; color: var(--muted); font-size: 21px; letter-spacing: .16em; } .title { position: absolute; top: 82px; left: 96px; margin: 0; color: var(--ink); font-size: 54px; font-weight: 600; }
  .scene { position: absolute; inset: 220px 96px 110px; padding: 50px; border: 1px solid var(--line); border-radius: 28px; background: linear-gradient(135deg, rgba(17,19,24,.94), rgba(8,9,12,.72)); box-shadow: 0 28px 80px rgba(0,0,0,.42); } .scene-visual, .visual-stack { height: 590px; display: grid; place-items: center; } .visual-stack { width: 100%; grid-template-rows: auto 1fr auto; gap: 10px; }
  .math-svg { width: 100%; height: 100%; overflow: visible; } .manim-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; z-index: 0; border-radius: 18px; } .manim-global { inset: 220px 28px 110px; opacity: .9; pointer-events: none; border-radius: 28px; } .scene-visual > *:not(.manim-media) { position: relative; z-index: 1; } .grid { fill: none; stroke: #292d34; stroke-width: 1.5; } .axis { fill: none; stroke: var(--ink); stroke-width: 3; } .curve { fill: none; stroke: var(--coral); stroke-width: 8; stroke-linecap: round; filter: drop-shadow(0 0 10px rgba(255,128,102,.3)); } .origin { fill: var(--blue); } .vertex { fill: var(--coral); filter: drop-shadow(0 0 14px rgba(255,128,102,.75)); } .projection { fill: none; stroke: var(--blue); stroke-width: 3; stroke-dasharray: 8 10; } .curve-tracer { fill: var(--ink); stroke: var(--coral); stroke-width: 4; filter: drop-shadow(0 0 12px rgba(255,128,102,.8)); }
  .formula-card, .formula-callout { max-width: 88%; padding: 16px 28px; border: 1px solid rgba(244,238,228,.18); border-radius: 16px; background: rgba(17,19,24,.92); } .formula-callout { position: absolute; top: 28px; left: 50%; transform: translateX(-50%); z-index: 2; } .formula { color: var(--ink); font-family: "Noto Serif SC", "Noto Sans SC", serif; font-size: 38px; line-height: 1.45; text-align: center; overflow-wrap: anywhere; } .scene-card { display: grid; gap: 24px; place-items: center; width: 100%; height: 100%; border-radius: 22px; background: rgba(17,19,24,.68); padding: 34px; } .scene-label { color: var(--muted); font-size: 22px; }
  .formula-stage { align-content: center; gap: 22px; } .equation-steps { width: min(1180px, 92%); display: grid; gap: 12px; padding: 18px 32px; border-left: 3px solid var(--blue); background: linear-gradient(90deg, rgba(120,169,255,.08), transparent 72%); } .equation-step { display: grid; grid-template-columns: 54px 1fr; column-gap: 12px; align-items: center; min-height: 64px; padding: 7px 16px; border-radius: 12px; opacity: 0; transform: translateY(18px); transition: background .2s ease, color .2s ease, box-shadow .2s ease; } .equation-step.current-equation-step { color: #fff7dc; background: rgba(255,128,102,.13); box-shadow: inset 4px 0 var(--coral), 0 0 22px rgba(255,128,102,.1); } .equation-step .formula { font-size: 48px; text-align: left; } .equation-index { color: var(--muted); font-size: 22px; text-align: right; }
  .challenge-card { display: grid; gap: 18px; justify-items: center; min-width: 760px; } .challenge-badge { padding: 10px 22px; border: 1px solid rgba(255,128,102,.7); border-radius: 999px; color: var(--coral); font-size: 24px; } .challenge-prompt { color: var(--ink); font-size: 36px; text-align: center; } .options { display: flex; gap: 18px; } .option { padding: 10px 24px; border: 1px solid rgba(244,238,228,.25); border-radius: 999px; color: var(--ink); font-size: 28px; } .option-wrong, .wrong-label { border-color: var(--coral); color: var(--coral); } .wrong-label { padding: 8px 16px; border-radius: 999px; font-size: 22px; }
  .subtitle { position: absolute; left: 150px; right: 150px; bottom: 24px; min-height: 76px; padding: 8px 28px; color: var(--ink); font-size: 30px; font-weight: 500; line-height: 1.35; display: flex; align-items: flex-end; justify-content: center; align-content: flex-end; flex-wrap: wrap; overflow: hidden; text-align: center; text-shadow: 0 2px 14px rgba(0,0,0,.65); } .subtitle-char { display: inline-block; min-width: .5em; white-space: pre; } audio { display: none; }
  .scene-visual { position: relative; overflow: hidden; } .scene--has-media .scene-card { background: rgba(17,19,24,.22); } .scene--has-media .formula-stage { background: rgba(17,19,24,.16); } .root--has-global-media .scene { background: linear-gradient(135deg, rgba(17,19,24,.46), rgba(8,9,12,.34)); } .root--has-global-media .scene-card { background: rgba(17,19,24,.22); } .root--has-global-media .formula-stage { background: rgba(17,19,24,.16); } .question-details { width: min(900px, 94%); max-height: 440px; overflow: hidden; padding: 22px 26px; border: 1px solid rgba(120,169,255,.32); border-radius: 18px; background: rgba(9,10,13,.82); color: var(--ink); font-size: 26px; line-height: 1.65; text-align: left; white-space: pre-wrap; } .scene--challenge .scene-card { display: block; position: relative; padding: 0; background: transparent; } .scene--challenge .challenge-card { position: absolute; z-index: 2; top: 8px; left: 2%; width: 96%; min-width: 0; display: grid; gap: 8px; } .scene--challenge .challenge-badge { font-size: 20px; padding: 7px 18px; } .scene--challenge .challenge-prompt { font-size: 26px; } .scene--challenge .question-details { width: 100%; max-height: 360px; padding: 14px 18px; font-size: 21px; line-height: 1.42; background: rgba(9,10,13,.9); } .scene--challenge .subtitle { z-index: 4; } .root--has-global-media .scene--solution-step .scene-card, .root--has-global-media .scene--mistake .scene-card, .root--has-global-media .scene--summary .scene-card { display: block; position: relative; padding: 0; background: transparent; } .root--has-global-media .scene--solution-step .scene-label, .root--has-global-media .scene--mistake .scene-label, .root--has-global-media .scene--summary .scene-label { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); z-index: 2; white-space: nowrap; } .root--has-global-media .scene--solution-step .formula-card, .root--has-global-media .scene--mistake .formula-card { position: absolute; z-index: 2; top: 145px; left: 50%; transform: translateX(-50%); white-space: nowrap; } .root--has-global-media .scene--mistake .wrong-label { position: absolute; z-index: 2; top: 112px; left: 50%; transform: translateX(-50%); white-space: nowrap; } .root--has-global-media .scene--summary .scene-label { top: 75px; }
  .root--has-global-media .scene--solution-step .formula-card, .root--has-global-media .scene--mistake .formula-card { white-space: normal; overflow-wrap: anywhere; }
  .root--has-global-media .scene--solution-step .formula-card .formula, .root--has-global-media .scene--mistake .formula-card .formula { font-size: 26px; line-height: 1.3; }
  ${stageCss}
</style></head><body><main id="root" class="${useGlobalMedia ? 'root--has-global-media' : ''}" data-composition-id="root" data-start="0" data-width="${width}" data-height="${height}" data-fps="${fps}" width="${width}" height="${height}" data-storyboard-id="${escapeHtml(storyboard.id)}">
  ${globalMedia}<div class="eyebrow">数学实验室 · 武汉中考数学</div><h1 class="title">${escapeHtml(displayTitle)}</h1>${scenes}
</main><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script><script>
  const timeline = gsap.timeline({ paused: true }); ${timeline}
  window.__timelines = window.__timelines || {}; window.__timelines["root"] = timeline;
</script></body></html>`;
};

export const renderStoryboardHtml = renderCompositionHtml;
