"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface SummaryItem {
  id: string;
  studentName: string;
  type: "WEEKLY" | "MONTHLY" | "SEMESTER";
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "PENDING_REVIEW" | "REVIEWED" | "PUBLISHED";
  stats: Record<string, number> | null;
  aiSuggestions: { suggestions?: string[] } | null;
}

const TYPE_LABEL: Record<SummaryItem["type"], string> = {
  WEEKLY: "周报",
  MONTHLY: "月报",
  SEMESTER: "学期总结",
};

function TeacherSummaries() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const data = await api.get<{ items: SummaryItem[] }>("/api/v1/summaries");
    setItems(data.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ items: SummaryItem[] }>("/api/v1/summaries")
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "学习总结加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function update(id: string, action: "review" | "publish") {
    setBusyId(id);
    setError("");
    try {
      if (action === "review") {
        await api.patch(`/api/v1/summaries/${id}/review`, {});
      } else {
        await api.post(`/api/v1/summaries/${id}/publish`);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">学习总结审核</h1>
        <p className="mt-1 text-sm text-[#1e2a3a]/60">审核后可发布给对应家庭。</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 && !error && <p className="text-sm text-[#1e2a3a]/50">暂无学习总结</p>}
      <div className="space-y-4">
        {items.map((item) => (
          <section key={item.id} className="space-y-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.studentName} · {TYPE_LABEL[item.type]}</h2>
                <p className="mt-1 text-sm text-[#1e2a3a]/60">{item.periodStart.slice(0, 10)} 至 {item.periodEnd.slice(0, 10)} · {item.status}</p>
              </div>
              <div className="flex gap-2">
                {item.status === "PENDING_REVIEW" && <button disabled={busyId === item.id} onClick={() => void update(item.id, "review")} className="rounded-lg border border-[#1e2a3a]/20 px-3 py-1.5 text-sm disabled:opacity-50">{busyId === item.id ? "处理中…" : "审核通过"}</button>}
                {item.status === "REVIEWED" && <button disabled={busyId === item.id} onClick={() => void update(item.id, "publish")} className="rounded-lg bg-[#e8863a] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busyId === item.id ? "处理中…" : "发布给家庭"}</button>}
              </div>
            </div>
            {item.stats && <p className="text-sm text-[#1e2a3a]/70">本期错题 {item.stats.totalWrongQuestions ?? 0} 道，已掌握 {item.stats.mastered ?? 0} 道。</p>}
            {(item.aiSuggestions?.suggestions ?? []).length > 0 && <ul className="list-inside list-disc rounded-lg bg-[#faf6ee] p-3 text-sm">{item.aiSuggestions!.suggestions!.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>}
          </section>
        ))}
      </div>
    </div>
  );
}

export default function TeacherSummariesPage() {
  return <AuthGuard><TeacherSummaries /></AuthGuard>;
}
