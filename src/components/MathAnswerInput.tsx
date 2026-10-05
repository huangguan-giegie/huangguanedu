"use client";

import { useEffect, useRef, useState } from "react";

interface MathFieldLike extends HTMLElement {
  value: string;
  virtualKeyboardMode?: string;
  smartMode?: boolean;
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
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathFieldLike | null>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureMathLive()
      .then(() => {
        if (cancelled || !hostRef.current || !customElements.get("math-field")) return;
        const field = document.createElement("math-field") as MathFieldLike;
        field.value = props.value;
        field.virtualKeyboardMode = "onfocus";
        field.smartMode = true;
        field.setAttribute("aria-label", "数学答案输入");
        field.setAttribute("style", "display:block;width:100%;min-height:44px;padding:9px 12px;border:1px solid rgba(30,42,58,.2);border-radius:8px;background:white;");
        if (props.placeholder) field.setAttribute("placeholder", props.placeholder);
        if (props.disabled) field.setAttribute("disabled", "");
        field.addEventListener("input", () => props.onChange(field.value));
        hostRef.current.replaceChildren(field);
        fieldRef.current = field;
        setEnhanced(true);
      })
      .catch(() => setEnhanced(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fieldRef.current && fieldRef.current.value !== props.value) {
      fieldRef.current.value = props.value;
    }
  }, [props.value]);

  useEffect(() => {
    if (!fieldRef.current) return;
    if (props.disabled) fieldRef.current.setAttribute("disabled", "");
    else fieldRef.current.removeAttribute("disabled");
  }, [props.disabled]);

  return (
    <div>
      <div ref={hostRef}>
        {!enhanced && (
          <input
            className="w-full rounded-lg border border-[#1e2a3a]/20 bg-white px-3 py-2"
            value={props.value}
            disabled={props.disabled}
            placeholder={props.placeholder ?? "输入答案"}
            onChange={(event) => props.onChange(event.target.value)}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-[#1e2a3a]/45">
        {enhanced ? "支持公式键盘与 LaTeX 输入" : "普通输入模式（MathLive 不可用时自动回退）"}
      </p>
    </div>
  );
}
