export const QWEN_MODEL_BY_MODE = {
  STANDARD: "qwen3.7-plus",
  COMPLEX: "qwen3.8-max",
} as const;

export type QwenModelMode = keyof typeof QWEN_MODEL_BY_MODE;

export function qwenModelForMode(mode: QwenModelMode): string {
  return QWEN_MODEL_BY_MODE[mode];
}
