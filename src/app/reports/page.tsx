"use client";

import { useEffect, useState } from "react";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";

interface SummaryItem {
  id: string;
  type: "WEEKLY" | "MONTHLY" | "SEMESTER";
  periodStart: string;
  periodEnd: string;
  status: string;
  studentName: string;
  aiSuggestions: { suggestions?: string[] } | null;
  stats: {
    totalWrongQuestions?: number;
    mastered?: number;
  } | null;
}

const TYPE_LABEL: Record<SummaryItem["type"], string> = {
  WEEKLY: "周报",
  MONTHLY: "月报",
  SEMESTER: "学期总结",
};

function periodText(item: SummaryItem): string {
  const start = item.periodStart.slice(0, 10);
  const end = item.periodEnd.slice(0, 10);
  return item.type === "MONTHLY" ? start.slice(0, 7) : `${start} 至 ${end}`;
}

function Summaries() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: SummaryItem[] }>("/api/v1/summaries")
      .then((d) => {
        if (!cancelled) {
          setItems(d.items);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">学习总结</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {items.length === 0 && !error && (
        <p className="text-sm text-[#1e2a3a]/50">暂无学习总结</p>
      )}
      {items.map((summary) => (
        <div key={summary.id} className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {periodText(summary)} {TYPE_LABEL[summary.type]}
            </h2>
            <span className="text-xs text-[#1e2a3a]/50">
              {summary.studentName} ｜ {summary.status === "PUBLISHED" ? "已发布" : summary.status}
            </span>
          </div>
          {summary.stats && (
            <p className="mt-3 text-sm text-[#1e2a3a]/70">
              本期错题 {summary.stats.totalWrongQuestions ?? 0} 道，已掌握{" "}
              {summary.stats.mastered ?? 0} 道
            </p>
          )}
          {(summary.aiSuggestions?.suggestions ?? []).length > 0 && (
            <div className="mt-3 rounded bg-[#faf6ee] p-3">
              <p className="text-sm font-semibold">学习建议</p>
              <ul className="mt-1 list-inside list-disc text-sm">
                {summary.aiSuggestions!.suggestions!.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AuthGuard>
      <Summaries />
    </AuthGuard>
  );
}
