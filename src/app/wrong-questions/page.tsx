"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";

interface WrongQuestionItem {
  id: string;
  subject: "MATH" | "ENGLISH";
  recognizedQuestion: string | null;
  knowledgePoints: string[];
  mastered: boolean | null;
  status: string;
  isAiGenerated: boolean;
  isTeacherReviewed: boolean;
  updatedAt: string;
}

function List() {
  const [items, setItems] = useState<WrongQuestionItem[]>([]);
  const [subject, setSubject] = useState("");
  const [mastered, setMastered] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const data = await api.get<{ items: WrongQuestionItem[] }>(
          `/api/v1/wrong-questions?${new URLSearchParams({
            ...(subject ? { subject } : {}),
            ...(mastered ? { mastered } : {}),
          }).toString()}`,
        );
        if (!cancelled) {
          setItems(data.items);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [subject, mastered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的错题本</h1>
        <Link href="/wrong-questions/new" className="text-[#e8863a] hover:underline">
          + 上传错题
        </Link>
      </div>
      <div className="flex gap-3 text-sm">
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">全部学科</option>
          <option value="MATH">数学</option>
          <option value="ENGLISH">英语</option>
        </select>
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1"
          value={mastered}
          onChange={(e) => setMastered(e.target.value)}
        >
          <option value="">全部掌握状态</option>
          <option value="true">已理解</option>
          <option value="false">仍不会</option>
        </select>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/wrong-questions/${item.id}`}
            className="block rounded-xl border border-[#1e2a3a]/10 bg-white p-4 hover:border-[#e8863a]"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {item.recognizedQuestion ?? "（待识别）"}
              </span>
              <span className="text-xs text-[#1e2a3a]/50">
                {item.subject === "MATH" ? "数学" : "英语"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {item.knowledgePoints.map((p) => (
                <span key={p} className="rounded bg-[#faf6ee] px-2 py-0.5">
                  {p}
                </span>
              ))}
              {item.isTeacherReviewed && (
                <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
                  老师已审核
                </span>
              )}
              {item.mastered !== null && (
                <span
                  className={`rounded px-2 py-0.5 ${
                    item.mastered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.mastered ? "已理解" : "仍不会"}
                </span>
              )}
            </div>
          </Link>
        ))}
        {items.length === 0 && !error && (
          <p className="text-sm text-[#1e2a3a]/50">暂无错题</p>
        )}
      </div>
    </div>
  );
}

export default function WrongQuestionsPage() {
  return (
    <AuthGuard>
      <List />
    </AuthGuard>
  );
}
