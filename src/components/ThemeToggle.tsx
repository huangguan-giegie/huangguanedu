// 主题切换：深色（默认）↔ 浅色
//
// 设计约束（01 §9）：
// 1. 换肤 = 换 CSS 变量值，不改任何页面 JSX。切换只写 <html> 的 data-theme
//    与 color-scheme，CSS 侧的 :root[data-theme="light"] 自动接管。
// 2. 首屏防闪烁由 layout.tsx 里的阻塞式内联脚本负责（必须在 React 水合前
//    跑完）。本组件在水合后从 DOM 读取真实主题，**不重复计算**——否则两处
//    逻辑各算一遍，localStorage 被隐私模式禁用等边界情况下会不一致。
// 3. 不监听系统主题变化：产品默认深色，用户显式选择后不再被系统覆盖——否则
//    系统切一次浅色，正在使用的产品就变了，用户会以为出 bug。

"use client";

import { useCallback, useSyncExternalStore } from "react";

import { Icon } from "./icons";

type Theme = "dark" | "light";

const STORAGE_KEY = "hg-theme";

/**
 * 读当前主题。真相来源是 <html data-theme> —— 它由 layout.tsx 的内联脚本在
 * 水合前写好，本组件只订阅它。用 useSyncExternalStore 而不是
 * useState + useEffect：后者会在 effect 里 setState，造成级联渲染
 * （React 19 的 lint 规则 react-hooks/set-state-in-effect 明确禁止）。
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  // 同一标签页的其他组件（如多标签页同步）改了 storage 也要跟着变
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** SSR 阶段没有 DOM，返回深色 —— 与 :root 的默认值一致，不会水合失配。 */
function getServerSnapshot(): Theme {
  return "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = next;
    // 原生控件（滚动条、select 弹出层、表单自动填充）必须同步，否则与主题打架
    root.style.colorScheme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式下 localStorage 不可写：不存也能用，本次会话内切换仍生效 */
    }
  }, [theme]);

  const nextLabel = theme === "dark" ? "浅色" : "深色";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`切换到${nextLabel}主题`}
      title={`切换到${nextLabel}主题`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      <span className="theme-toggle__label">{theme === "dark" ? "浅色" : "深色"}</span>
    </button>
  );
}
