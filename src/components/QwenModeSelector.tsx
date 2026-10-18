"use client";

import type { QwenModelMode } from "../lib/qwen-model";

const options: { mode: QwenModelMode; label: string; model: string; hint: string }[] = [
  { mode: "STANDARD", label: "标准模式", model: "qwen3.7-plus", hint: "日常识别与练习" },
  { mode: "COMPLEX", label: "复杂模式", model: "qwen3.8-max", hint: "适合综合难题" },
];

export function QwenModeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: QwenModelMode;
  onChange: (mode: QwenModelMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">AI 模式</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.mode}
            className={`flex min-w-44 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
              value === option.mode
                ? "border-[#754be6] bg-[#f3f0ff]"
                : "border-[#302a38]/15 bg-white"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="qwen-model-mode"
              value={option.mode}
              checked={value === option.mode}
              disabled={disabled}
              onChange={() => onChange(option.mode)}
              className="mt-1 accent-[#754be6]"
            />
            <span className="grid gap-0.5">
              <span className="font-semibold">{option.label}</span>
              <span className="text-xs text-[#302a38]/60">{option.model} · {option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
