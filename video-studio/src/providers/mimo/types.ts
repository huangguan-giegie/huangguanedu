export interface LessonInput {
  title?: string;
  objective?: string;
  language?: string;
  durationMinutes?: number;
  targetDurationSeconds?: number;
  hook?: string;
  cta?: string;
  equationSteps?: string[];
  imagePaths?: string[];
  [key: string]: unknown;
}

export interface Storyboard {
  scenes?: unknown[];
  storyboard?: unknown[];
  [key: string]: unknown;
}

export interface MimoFetchOptions {
  apiKey?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
