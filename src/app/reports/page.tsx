"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "../../components/EmptyState";

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
  const [type, setType] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: SummaryItem[] }>(`/api/v1/summaries${type ? `?type=${type}` : ""}`)
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
  }, [type]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">学习总结</h1>
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm">总结类型 <select className="rounded-lg border border-[#302a38]/20 px-3 py-2" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部</option><option value="WEEKLY">周报</option><option value="MONTHLY">月报</option><option value="SEMESTER">学期总结</option></select></label>
        <Link href="/practice" className="inline-flex min-h-11 items-center rounded-xl border border-[#754be6]/30 px-4 text-sm font-semibold text-[#754be6]">打开错题模拟练习 →</Link>
      </div>
      {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
      {items.length === 0 && !error && (
        <EmptyState title="暂无学习总结" description="孩子完成若干次错题订正后，系统会按周、按月整理学习总结。先去看看错题本吧。" actionHref="/wrong-questions" actionLabel="打开错题本" />
      )}
      {items.map((summary) => (
        <div key={summary.id} className="rounded-xl border border-[#302a38]/10 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              {periodText(summary)} {TYPE_LABEL[summary.type]}
            </h2>
            <span className="text-xs text-[#302a38]/50">
              {summary.studentName} ｜ {summary.status === "PUBLISHED" ? "已发布" : summary.status}
            </span>
          </div>
          {summary.stats && (
            <p className="mt-3 text-sm text-[#302a38]/70">
              本期错题 {summary.stats.totalWrongQuestions ?? 0} 道，已掌握{" "}
              {summary.stats.mastered ?? 0} 道
            </p>
          )}
          {(summary.aiSuggestions?.suggestions ?? []).length > 0 && (
            <div className="mt-3 rounded bg-[#f3f0ff] p-3">
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
