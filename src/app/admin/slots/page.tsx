"use client";

import { useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

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
      {message && <div className="rounded bg-green-100 p-3 text-sm text-green-700">{message}</div>}
      {error && <div className="rounded bg-red-100 p-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={create} className="grid max-w-2xl gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 sm:grid-cols-3">
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="ONE_ON_ONE">一对一（容量 1）</option>
          <option value="SMALL_CLASS">小班（容量 ≤5）</option>
        </select>
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        >
          <option value="MATH">数学</option>
          <option value="ENGLISH">英语</option>
        </select>
        <select
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
          value={form.teacherId}
          onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
          required
        >
          <option value="">选择老师</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          type="datetime-local"
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          required
        />
        <input
          type="datetime-local"
          className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          required
        />
        <button className="rounded-lg bg-[#e8863a] font-semibold text-white" type="submit">
          创建时段
        </button>
      </form>
      <table className="w-full rounded-xl border border-[#1e2a3a]/10 bg-white text-sm">
        <thead className="border-b border-[#1e2a3a]/10 text-left">
          <tr>
            <th className="p-3">类型</th>
            <th className="p-3">科目</th>
            <th className="p-3">时间</th>
            <th className="p-3">老师</th>
            <th className="p-3">容量</th>
            <th className="p-3">状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-[#1e2a3a]/5">
              <td className="p-3">{s.type === "ONE_ON_ONE" ? "一对一" : "小班"}</td>
              <td className="p-3">{s.subject === "MATH" ? "数学" : "英语"}</td>
              <td className="p-3">
                {new Date(s.startTime).toLocaleString("zh-CN")} -{" "}
                {new Date(s.endTime).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="p-3">{s.teacherName}</td>
              <td className="p-3">{s.capacity}</td>
              <td className="p-3">{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
