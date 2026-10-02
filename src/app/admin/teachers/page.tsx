"use client";

import { useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface TeacherItem {
  id: string;
  userId: string;
  phone: string;
  name: string;
  isActive: boolean;
  university: string | null;
  major: string | null;
  degree: string | null;
}

function Teachers() {
  const [items, setItems] = useState<TeacherItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [form, setForm] = useState({
    phone: "",
    name: "",
    university: "",
    major: "",
    degree: "",
  });

  async function load() {
    const d = await api.get<{ teachers: TeacherItem[] }>("/api/v1/admin/teachers");
    setItems(d.teachers);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ teachers: TeacherItem[] }>("/api/v1/admin/teachers")
      .then((d) => {
        if (!cancelled) {
          setItems(d.teachers);
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

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const d = await api.post<{ tempPassword: string }>("/api/v1/admin/teachers", form);
      setTempPassword(d.tempPassword);
      setMessage("老师账号创建成功，初始密码只显示一次");
      setShowCreate(false);
      setForm({ phone: "", name: "", university: "", major: "", degree: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    }
  }

  async function resetPassword(userId: string, name: string) {
    setError("");
    setMessage("");
    if (!confirm(`确认重置 ${name} 的密码？将撤销其全部登录会话。`)) {
      return;
    }
    try {
      const d = await api.post<{ tempPassword: string }>(
        `/api/v1/admin/teachers/${userId}/reset-password`,
      );
      setTempPassword(d.tempPassword);
      setMessage(`已重置 ${name} 的密码，初始密码只显示一次`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重置失败");
    }
  }

  async function disableTeacher(id: string, name: string) {
    setError("");
    setMessage("");
    if (!confirm(`确认停用${name}的账号？此操作会解除其当前负责关系并撤销登录会话。`)) {
      return;
    }
    try {
      await api.del(`/api/v1/admin/teachers/${id}`);
      setMessage(`已停用${name}的账号。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用老师账号失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">老师管理</h1>
        <button
          className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "取消" : "+ 创建老师"}
        </button>
      </div>
      {message && (
        <div className="rounded bg-green-100 p-3 text-sm text-green-700">
          {message}
          {tempPassword && (
            <div className="mt-1 font-mono text-base">{tempPassword}</div>
          )}
        </div>
      )}
      {error && <div className="rounded bg-red-100 p-3 text-sm text-red-700">{error}</div>}
      {showCreate && (
        <form onSubmit={create} className="grid max-w-lg gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 sm:grid-cols-2">
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="手机号（11 位）"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="毕业院校"
            value={form.university}
            onChange={(e) => setForm({ ...form, university: e.target.value })}
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="专业"
            value={form.major}
            onChange={(e) => setForm({ ...form, major: e.target.value })}
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="学位"
            value={form.degree}
            onChange={(e) => setForm({ ...form, degree: e.target.value })}
          />
          <button className="rounded-lg bg-[#e8863a] font-semibold text-white" type="submit">
            创建
          </button>
        </form>
      )}
      <table className="w-full rounded-xl border border-[#1e2a3a]/10 bg-white text-sm">
        <thead className="border-b border-[#1e2a3a]/10 text-left">
          <tr>
            <th className="p-3">姓名</th>
            <th className="p-3">手机号</th>
            <th className="p-3">状态</th>
            <th className="p-3">学历</th>
            <th className="p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-b border-[#1e2a3a]/5">
              <td className="p-3">{t.name}</td>
              <td className="p-3">{t.phone}</td>
              <td className="p-3">{t.isActive ? "正常" : "已停用"}</td>
              <td className="p-3">
                {[t.university, t.major, t.degree].filter(Boolean).join(" / ") || "-"}
              </td>
              <td className="p-3">
                <button
                  className="text-sm text-[#e8863a] hover:underline"
                  onClick={() => resetPassword(t.userId, t.name)}
                >
                  重置密码
                </button>
                {t.isActive && (
                  <button
                    className="ml-3 text-sm text-red-600 hover:underline"
                    onClick={() => void disableTeacher(t.id, t.name)}
                  >
                    停用账号
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTeachersPage() {
  return (
    <AuthGuard>
      <Teachers />
    </AuthGuard>
  );
}
