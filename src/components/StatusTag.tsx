// 状态标签：把 statusMeta 的 tone/mark 落成 .status-tag 结构。
// 抽成组件而不是在每个页面内联，是为了让「颜色 + 图形 + 读屏补充文字」
// 三通道永远成套出现 —— 少任何一通道，色弱用户就丢信息。

import { statusMeta } from "../lib/wrong-question-status";
import { Icon } from "./icons";

export function StatusTag({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span className={`status-tag status-tag--${meta.tone}`}>
      {meta.mark === "check" ? (
        <Icon name="check" size={12} className="status-tag__icon" />
      ) : (
        <span className="status-tag__dot" aria-hidden="true" />
      )}
      <span>{meta.label}</span>
      <span className="sr-only">，{meta.srText}</span>
    </span>
  );
}
