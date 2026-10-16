"use client";

import { useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";
import { Icon } from "../../../components/icons";

/**
 * 课程时段状态映射。
 *
 * 原先 `<td>{s.status}</td>` 直接向中文用户输出 OPEN / BOOKED / CANCELLED
 * 这样的英文枚举 —— 这是真实的 i18n 缺陷，不是设计问题。
 * OPEN=可预约（success）· BOOKED=已约满（warning）· CANCELLED=已取消（danger）
 */
const SLOT_STATUS = {
  OPEN: { label: "可预约", tone: "success" },
  BOOKED: { label: "已约满", tone: "warning" },
  CANCELLED: { label: "已取消", tone: "danger" },
} as const;

interface SlotItem {
  id: string;
  type: "SMALL_CLASS" | "ONE_ON_ONE";
  subject: "MATH" | "ENGLISH";
  grade: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  status: string;
  teacherName: string;
}

interface TeacherOption {
  id: string;
  name: string;
}

function Slots() {
  const [items, setItems] = useState<SlotItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    type: "ONE_ON_ONE",
    grade: "初二",
    subject: "MATH",
    teacherId: "",
    startTime: "",
    endTime: "",
    capacity: 1,
  });

  async function load() {
    const [slotData, teacherData] = await Promise.all([
      api.get<{ slots: SlotItem[] }>("/api/v1/admin/course-slots?pageSize=100"),
      api.get<{ teachers: TeacherOption[] }>("/api/v1/admin/teachers"),
    ]);
    setItems(slotData.slots);
    setTeachers(teacherData.teachers);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [slotData, teacherData] = await Promise.all([
          api.get<{ slots: SlotItem[] }>("/api/v1/admin/course-slots?pageSize=100"),
          api.get<{ teachers: TeacherOption[] }>("/api/v1/admin/teachers"),
        ]);
        if (!cancelled) {
          setItems(slotData.slots);
          setTeachers(teacherData.teachers);
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
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const start = new Date(form.startTime);
    const end = new Date(form.endTime);
    try {
      await api.post("/api/v1/admin/course-slots", {
        type: form.type,
        grade: form.grade,
        subject: form.subject,
        teacherId: form.teacherId,
        date: start.toISOString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: Number(form.capacity),
      });
      setMessage("课程时段创建成功");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">课程时段管理</h1>
      {message && (
        <div className="callout callout--success" role="status">
          <Icon name="check" size={18} />
          <div><strong>已完成</strong><p>{message}</p></div>
        </div>
      )}
      {error && (
        <div className="callout callout--danger" role="alert">
          <Icon name="alert" size={18} />
          <div><strong>操作未完成</strong><p>{error}</p></div>
        </div>
      )}
      {/* P0-11：原先这 4 个控件既无 <label> 也无 aria-label，读屏用户听到的是
          "组合框，无标签"，完全不知道要选什么。用 <label> 包裹建立隐式关联，
          并给必填项加视觉 + 语义标记。 */}
      <form onSubmit={create} className="grid max-w-2xl gap-3 rounded-xl border border-[#302a38]/10 bg-white p-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="form-field__label">课程类型</span>
          <select
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="ONE_ON_ONE">一对一（容量 1）</option>
            <option value="SMALL_CLASS">小班（容量 ≤5）</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="form-field__label">科目</span>
          <select
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          >
            <option value="MATH">数学</option>
            <option value="ENGLISH">英语</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="form-field__label" data-required>授课老师</span>
          <select
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            value={form.teacherId}
            onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            required
          >
            <option value="">选择老师</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="form-field__label" data-required>开始时间</span>
          <input
            type="datetime-local"
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="form-field__label" data-required>结束时间</span>
          <input
            type="datetime-local"
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            required
          />
        </label>
        <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#754be6] font-semibold text-white" type="submit">
          <Icon name="plus" size={16} />
          创建时段
        </button>
      </form>
      {/* P0-17：原先 <table> 直接挂在 <div className="space-y-6"> 下、没有
          overflow-x 包装，靠 `.app-content table { display:block }` 兜底 ——
          那意味着整个页面（而不只是表格）可能被撑宽。 */}
      <div className="table-scroll">
      <table className="w-full text-sm">
        <caption className="sr-only">课程时段列表</caption>
        <thead className="border-b border-[#302a38]/10 text-left">
          <tr>
            <th scope="col" className="p-3" data-priority="3">类型</th>
            <th scope="col" className="p-3" data-priority="2">科目</th>
            <th scope="col" className="p-3" data-priority="1">时间</th>
            <th scope="col" className="p-3">老师</th>
            <th scope="col" className="p-3" data-priority="1">容量</th>
            <th scope="col" className="p-3">状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-[#302a38]/5">
              <td className="p-3" data-label="类型" data-priority="3">{s.type === "ONE_ON_ONE" ? "一对一" : "小班"}</td>
              <td className="p-3" data-label="科目" data-priority="2">{s.subject === "MATH" ? "数学" : "英语"}</td>
              {/* 时间列拆两行：原先 toLocaleString 全量输出单格可能 24 字符宽，
                  是全表最难压缩的一列 */}
              <td className="p-3" data-label="时间" data-priority="1">
                <span className="block">{new Date(s.startTime).toLocaleDateString("zh-CN")}</span>
                <span className="block text-[#302a38]/60">
                  {new Date(s.startTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {new Date(s.endTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </td>
              <td className="p-3" data-label="老师">{s.teacherName}</td>
              <td className="p-3" data-label="容量" data-priority="1">{s.capacity}</td>
              {/* P0-10：原先是 <td>{s.status}</td> 直接向中文用户输出
                  OPEN / BOOKED / CANCELLED 这样的英文枚举。 */}
              <td className="p-3" data-label="状态">
                <span className={`status-tag status-tag--${SLOT_STATUS[s.status as keyof typeof SLOT_STATUS]?.tone ?? "primary"}`}>
                  <span className="status-tag__dot" aria-hidden="true" />
                  {SLOT_STATUS[s.status as keyof typeof SLOT_STATUS]?.label ?? s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function AdminSlotsPage() {
  return (
    <AuthGuard>
      <Slots />
    </AuthGuard>
  );
}
