"use client";

import { useState } from "react";

import { api } from "./api";

interface Message {
  role: "user" | "assistant";
  content: string;
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
      <button className="text-sm text-[#e8863a] hover:underline" onClick={() => setOpen(true)}>
        问 AI 老师
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#1e2a3a]/10 bg-white p-3">
      <div className="flex items-center justify-between">
        <strong className="text-sm">AI 老师</strong>
        <button className="text-xs text-[#1e2a3a]/50" onClick={() => setOpen(false)}>收起</button>
      </div>
      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
        {messages.length === 0 && (
          <p className="text-[#1e2a3a]/55">告诉我你卡在哪一步，我会先给提示，不直接把答案抄给你。</p>
        )}
        {messages.map((item, index) => (
          <div key={index} className={item.role === "user" ? "ml-6 rounded-lg bg-[#faf6ee] p-2" : "mr-6 rounded-lg bg-blue-50 p-2"}>
            {item.content}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <input
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
          className="rounded-lg bg-[#1e2a3a] px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !message.trim()}
          onClick={() => void send()}
        >
          {busy ? "思考中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
