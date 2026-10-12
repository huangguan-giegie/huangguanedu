"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [form, setForm] = useState({
    phone: "",
    name: "",
    university: "",
    major: "",
    degree: "",
  });

  function startSaving() {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    setTempPassword("");
    return true;
  }

  function finishSaving() {
    busy.current = false;
    setSaving(false);
  }

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
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!startSaving()) return;
    try {
      const d = await api.post<{ tempPassword: string }>("/api/v1/admin/teachers", form);
      setTempPassword(d.tempPassword);
      setMessage("老师账号创建成功，初始密码只显示一次");
      setShowCreate(false);
      setForm({ phone: "", name: "", university: "", major: "", degree: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      finishSaving();
    }
  }

  async function resetPassword(userId: string, name: string) {
    if (busy.current || !confirm(`确认重置 ${name} 的密码？将撤销其全部登录会话。`)) {
      return;
    }
    if (!startSaving()) return;
    try {
      const d = await api.post<{ tempPassword: string }>(
        `/api/v1/admin/teachers/${userId}/reset-password`,
      );
      setTempPassword(d.tempPassword);
      setMessage(`已重置 ${name} 的密码，初始密码只显示一次`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重置失败");
    } finally {
      finishSaving();
    }
  }

  async function disableTeacher(id: string, name: string) {
    if (busy.current || !confirm(`确认停用${name}的账号？此操作会解除其当前负责关系并撤销登录会话，历史记录保留。`)) {
      return;
    }
    if (!startSaving()) return;
    try {
      await api.del(`/api/v1/admin/teachers/${id}`);
      setMessage(`已停用${name}的账号。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用老师账号失败");
    } finally {
      finishSaving();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">老师管理</h1>
        <button
          className="rounded-lg bg-[#754be6] px-4 py-2 text-sm font-semibold text-white"
          disabled={saving}
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "取消" : "+ 创建老师"}
        </button>
      </div>
      <Link className="inline-block text-sm text-[#754be6] hover:underline" href="/admin/students">学生与家庭账号</Link>
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
        <form onSubmit={create} className="grid max-w-lg gap-3 rounded-xl border border-[#302a38]/10 bg-white p-4 sm:grid-cols-2">
          <input
            aria-label="老师登录手机号"
            disabled={saving}
            inputMode="numeric"
            pattern="1[3-9][0-9]{9}"
            maxLength={11}
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            placeholder="手机号（11 位）"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <input
            aria-label="老师姓名"
            disabled={saving}
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            placeholder="姓名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            aria-label="老师毕业院校"
            disabled={saving}
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            placeholder="毕业院校"
            value={form.university}
            onChange={(e) => setForm({ ...form, university: e.target.value })}
          />
          <input
            aria-label="老师专业"
            disabled={saving}
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            placeholder="专业"
            value={form.major}
            onChange={(e) => setForm({ ...form, major: e.target.value })}
          />
          <input
            aria-label="老师学位"
            disabled={saving}
            className="rounded-lg border border-[#302a38]/20 px-3 py-2"
            placeholder="学位"
            value={form.degree}
            onChange={(e) => setForm({ ...form, degree: e.target.value })}
          />
          <button disabled={saving} className="rounded-lg bg-[#754be6] py-2 font-semibold text-white disabled:opacity-50" type="submit">
            {saving ? "正在创建…" : "创建"}
          </button>
        </form>
      )}
      {loading && <p className="text-sm text-[#302a38]/60">正在加载老师…</p>}
      <div className="overflow-x-auto rounded-xl border border-[#302a38]/10 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-[#302a38]/10 text-left">
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
            <tr key={t.id} className="border-b border-[#302a38]/5">
              <td className="p-3">{t.name}</td>
              <td className="p-3">{t.phone}</td>
              <td className="p-3">{t.isActive ? "正常" : "已停用"}</td>
              <td className="p-3">
                {[t.university, t.major, t.degree].filter(Boolean).join(" / ") || "-"}
              </td>
              <td className="p-3">
                <button
                  className="text-sm text-[#754be6] hover:underline"
                  disabled={saving || !t.isActive}
                  onClick={() => resetPassword(t.userId, t.name)}
                >
                  重置密码
                </button>
                {t.isActive && (
                  <button
                    className="ml-3 text-sm text-red-600 hover:underline"
                    disabled={saving}
                    onClick={() => void disableTeacher(t.id, t.name)}
                  >
                    停用账号
                  </button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && !loading && <tr><td colSpan={5} className="p-4 text-center text-[#302a38]/60">暂无老师，请创建老师账号。</td></tr>}
        </tbody>
      </table>
      </div>
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
