"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard, type SafeUser } from "../../../components/AuthGuard";
import { Icon } from "../../../components/icons";
import { EmptyState } from "../../../components/EmptyState";

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

/**
 * 学习总结状态映射（原先是内联对象，字面量散在 JSX 里，没法统一上语义色）。
 * 与错题状态同一套判断：DRAFT/PENDING_REVIEW 需要人行动 → warning；
 * REVIEWED 已审 → success；PUBLISHED 已发布给家庭 → primary（终态中性）。
 */
const SUMMARY_STATUS: Record<SummaryItem["status"], { label: string; tone: "warning" | "success" | "primary" }> = {
  DRAFT: { label: "草稿", tone: "warning" },
  PENDING_REVIEW: { label: "待审核", tone: "warning" },
  REVIEWED: { label: "已审核", tone: "success" },
  PUBLISHED: { label: "已发布", tone: "primary" },
};

const TYPE_LABEL: Record<SummaryItem["type"], string> = {
  WEEKLY: "周报",
  MONTHLY: "月报",
  SEMESTER: "学期总结",
};

function TeacherSummaries() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<SummaryItem["type"]>("WEEKLY");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const data = await api.get<{ items: SummaryItem[] }>("/api/v1/summaries");
    setItems(data.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<{ user: SafeUser }>("/api/v1/auth/me").then(async ({ user }) => {
      let list: { id: string; name: string }[] = [];
      if (user.role === "ADMIN") {
        let total = 1;
        for (let page = 1; list.length < total; page += 1) {
          const data = await api.get<{ total: number; students: { id: string; name: string; isActive: boolean }[] }>(`/api/v1/admin/students?pageSize=100&page=${page}`);
          total = data.total;
          list.push(...data.students);
          if (!data.students.length) break;
        }
      } else {
        list = (await api.get<{ students: { student: { id: string; name: string } }[] }>("/api/v1/teacher/students")).students.map((item) => item.student);
      }
      if (!cancelled) { setStudents(list); setStudentId(list[0]?.id ?? ""); }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "学生加载失败"); });
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

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusyId("generate"); setError(""); setMessage("");
    try {
      if (type === "SEMESTER" && (!start || !end || start > end)) throw new Error("请选择有效的学期起止日期");
      const periodEnd = end ? new Date(`${end}T00:00:00+08:00`) : null;
      if (periodEnd) periodEnd.setDate(periodEnd.getDate() + 1);
      await api.post("/api/v1/summaries/generate", { studentId, type, ...(type === "SEMESTER" ? { periodStart: `${start}T00:00:00+08:00`, periodEnd: periodEnd?.toISOString() } : {}) });
      await load(); setMessage("总结已整理，可查看、审核并发布。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "生成失败"); }
    finally { setBusyId(""); }
  }

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
        <p className="mt-1 text-sm text-[#302a38]/60">审核后可发布给对应家庭。</p>
      </div>
      <form onSubmit={generate} className="flex flex-wrap items-end gap-3 rounded-xl border border-[#302a38]/10 bg-white p-5">
        <label className="grid gap-1 text-sm">学生<select className="rounded-lg border border-[#302a38]/20 px-3 py-2" value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">选择学生</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">周期<select className="rounded-lg border border-[#302a38]/20 px-3 py-2" value={type} onChange={(event) => setType(event.target.value as SummaryItem["type"])}><option value="WEEKLY">本周周报</option><option value="MONTHLY">本月月报</option><option value="SEMESTER">学期总结</option></select></label>
        {type === "SEMESTER" && <><label className="grid gap-1 text-sm">开始日期<input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label className="grid gap-1 text-sm">截止日期<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></label></>}
        <button disabled={Boolean(busyId) || !studentId} className="rounded-lg bg-[#754be6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === "generate" ? "正在整理…" : "生成学习总结"}</button>
      </form>
      {message && (
        <div className="callout callout--success" role="status">
          <Icon name="check" size={18} />
          <div><strong>已完成</strong><p>{message}</p></div>
        </div>
      )}
      <label className="grid max-w-xs gap-1 text-sm">
        <span className="form-field__label">筛选周期</span>
        <select className="rounded-lg border border-[#302a38]/20 px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">全部</option>
          {Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {error && (
        <div className="callout callout--danger" role="alert">
          <Icon name="alert" size={18} />
          <div><strong>操作未完成</strong><p>{error}</p></div>
        </div>
      )}
      {items.length === 0 && !error && <EmptyState title="暂无学习总结" description="选择学生和周期后点「生成学习总结」，系统会在这里列出结果。" />}
      <div className="space-y-4">
        {items.filter((item) => !filter || item.type === filter).map((item) => (
          <section key={item.id} className="space-y-3 rounded-xl border border-[#302a38]/10 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.studentName} · {TYPE_LABEL[item.type]}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#302a38]/60">
                  <span>{item.periodStart.slice(0, 10)} 至 {item.periodEnd.slice(0, 10)}</span>
                  <span className={`status-tag status-tag--${SUMMARY_STATUS[item.status].tone}`}>
                    <span className="status-tag__dot" aria-hidden="true" />
                    {SUMMARY_STATUS[item.status].label}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                {(item.status === "PENDING_REVIEW" || item.status === "DRAFT") && <button disabled={busyId === item.id} onClick={() => void update(item.id, "review")} className="rounded-lg border border-[#302a38]/20 px-3 py-1.5 text-sm disabled:opacity-50">{busyId === item.id ? "处理中…" : "审核通过"}</button>}
                {item.status === "REVIEWED" && <button disabled={busyId === item.id} onClick={() => void update(item.id, "publish")} className="rounded-lg bg-[#754be6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busyId === item.id ? "处理中…" : "发布给家庭"}</button>}
              </div>
            </div>
            {item.stats && <p className="text-sm text-[#302a38]/70">本期错题 {item.stats.totalWrongQuestions ?? 0} 道，已掌握 {item.stats.mastered ?? 0} 道。</p>}
            {(item.aiSuggestions?.suggestions ?? []).length > 0 && <ul className="list-inside list-disc rounded-lg bg-[#f3f0ff] p-3 text-sm">{item.aiSuggestions!.suggestions!.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>}
          </section>
        ))}
      </div>
    </div>
  );
}

export default function TeacherSummariesPage() {
  return <AuthGuard><TeacherSummaries /></AuthGuard>;
}
