"use client";

import { createElement, useEffect, useState } from "react";

interface MathFieldLike extends HTMLElement {
  value: string;
}

const MATHLIVE_SRC = "https://cdn.jsdelivr.net/npm/mathlive@0.111.0/+esm";

function ensureMathLive(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("math-field")) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-huangguan-mathlive="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("MathLive load failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = MATHLIVE_SRC;
    script.dataset.huangguanMathlive = "1";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("MathLive load failed")), { once: true });
    document.head.appendChild(script);
  });
}

export function MathAnswerInput(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [ready, setReady] = useState(
    () => typeof window !== "undefined" && Boolean(customElements.get("math-field")),
  );

  useEffect(() => {
    let cancelled = false;
    ensureMathLive()
      .then(() => {
        if (!cancelled && customElements.get("math-field")) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div>
        <input
          className="w-full rounded-lg border border-[#1e2a3a]/20 bg-white px-3 py-2"
          value={props.value}
          disabled={props.disabled}
          placeholder={props.placeholder ?? "输入答案"}
          onChange={(event) => props.onChange(event.target.value)}
        />
        <p className="mt-1 text-xs text-[#1e2a3a]/45">
          普通输入模式（MathLive 加载后会自动切换公式键盘）
        </p>
      </div>
    );
  }

  return (
    <div>
      {createElement("math-field", {
        value: props.value,
        disabled: props.disabled || undefined,
        placeholder: props.placeholder ?? "输入答案",
        "aria-label": "数学答案输入",
        onInput: (event: Event) => {
          const target = event.currentTarget as MathFieldLike;
          props.onChange(target.value);
        },
        style: {
          display: "block",
          width: "100%",
          minHeight: "44px",
          padding: "9px 12px",
          border: "1px solid rgba(30,42,58,.2)",
          borderRadius: "8px",
          background: "white",
        },
      })}
      <p className="mt-1 text-xs text-[#1e2a3a]/45">支持公式键盘与 LaTeX 输入</p>
    </div>
  );
}
