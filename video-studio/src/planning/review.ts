import type { MathFinding } from "./types.js";

export function formatMathReviewJson(findings: readonly MathFinding[]): string {
  return JSON.stringify({ findings }, null, 2);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function formatMathReviewHtml(findings: readonly MathFinding[]): string {
  const rows = findings.length === 0
    ? "<p class=\"empty\">未发现数学审查提醒。</p>"
    : findings.map((item) => `<li><code>${escapeHtml(item.code)}</code> ${escapeHtml(item.message)}</li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>数学审查</title><style>body{font-family:system-ui,sans-serif;line-height:1.7;padding:24px;color:#172033}code{color:#a33b00}.empty{color:#28734a}</style></head><body><h1>数学审查</h1><ul>${rows}</ul></body></html>`;
}
