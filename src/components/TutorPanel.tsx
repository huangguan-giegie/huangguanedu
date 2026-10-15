"use client";

import { useState } from "react";

import { latexToUnicode } from "../lib/latex-to-unicode";
import { api } from "./api";
import { Icon } from "./icons";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * 渲染模型回复：先剥掉 Markdown 强调标记（模型爱用 **...**），
 * 再把 $...$ 里的 LaTeX 转成 Unicode，与题目/答案用同一个函数，
 * 否则学生看到的是原始 LaTeX 与星号。
 *
 * 只做这两件事——刻意不引入 Markdown 渲染库：回复内容是纯文本说明，
 * 不含列表与链接，引入库反而多一份体积与XSS 面。
 */
function MessageBody({ content }: { content: string }) {
  const text = latexToUnicode(content.replace(/\*\*(.+?)\*\*/g, "$1"));
  return <p className="whitespace-pre-wrap">{text}</p>;
}

export function TutorPanel({ practiceQuestionId }: { practiceQuestionId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const text = message.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setMessage("");
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ reply: string }>("/api/v1/tutor/chat", {
        practiceQuestionId,
        message: text,
        history: messages.slice(-6),
      });
      setMessages([...next, { role: "assistant", content: result.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 老师暂时不可用");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm text-[#e8863a] hover:underline"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <Icon name="sparkle" size={16} />
        问 AI 老师
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#1e2a3a]/10 bg-white p-3">
      <div className="flex items-center justify-between">
        <strong className="text-sm">
          <span className="inline-flex items-center gap-2">
            <Icon name="sparkle" size={16} />
            AI 老师
          </span>
        </strong>
        <button type="button" className="inline-flex min-h-[44px] items-center px-2 text-xs text-[#1e2a3a]/50" onClick={() => setOpen(false)}>
          <Icon name="chevron-right" size={14} style={{ transform: "rotate(90deg)" }} />
          收起
        </button>
      </div>
      {/* AI 消息用 info 淡底（--info-soft），与用户消息的暖底区分 */}
      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm" aria-live="polite" aria-atomic="false">
        {messages.length === 0 && (
          <p className="text-[#1e2a3a]/55">告诉我你卡在哪一步，我会先给提示，不直接把答案抄给你。</p>
        )}
        {messages.map((item, index) => (
          <div
            key={index}
            className={item.role === "user" ? "ml-6 rounded-lg bg-[#faf6ee] p-2" : "mr-6 rounded-lg bg-blue-50 p-2"}
          >
            <MessageBody content={item.content} />
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={`tutor-input-${practiceQuestionId}`}>向 AI 老师提问</label>
        <input
          id={`tutor-input-${practiceQuestionId}`}
          className="min-w-0 flex-1 rounded-lg border border-[#1e2a3a]/20 px-3 py-2 text-sm"
          value={message}
          maxLength={1500}
          placeholder="例如：为什么这里要移项？"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send();
          }}
        />
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#1e2a3a] px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !message.trim()}
          aria-busy={busy}
          onClick={() => void send()}
        >
          {busy ? "思考中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
