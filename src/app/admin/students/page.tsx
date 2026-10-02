"use client";

import { useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface StudentItem {
  id: string;
  name: string;
  grade: string;
  school: string;
  familyPhone: string;
  isActive: boolean;
  teachers: { assignmentId: string; teacherId: string; name: string }[];
}

interface TeacherItem {
  id: string;
  name: string;
  isActive: boolean;
}

const EMPTY_FORM = { phone: "", studentName: "", grade: "", school: "" };

function Students() {
  const [items, setItems] = useState<StudentItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tempPassword, setTempPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams({ pageSize: "100" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const [studentData, teacherData] = await Promise.all([
      api.get<{ students: StudentItem[] }>(`/api/v1/admin/students?${params}`),
      api.get<{ teachers: TeacherItem[] }>("/api/v1/admin/teachers"),
    ]);
    setItems(studentData.students);
    setTeachers(teacherData.teachers);
  }

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ pageSize: "100" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    Promise.all([
      api.get<{ students: StudentItem[] }>(`/api/v1/admin/students?${params}`),
      api.get<{ teachers: TeacherItem[] }>("/api/v1/admin/teachers"),
    ])
      .then(([studentData, teacherData]) => {
        if (!cancelled) {
          setItems(studentData.students);
          setTeachers(teacherData.teachers);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  async function createFamilyAccount(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setTempPassword("");
    try {
      const result = await api.post<{ account: { studentId: string }; tempPassword: string }>(
        "/api/v1/admin/family-accounts",
        form,
      );
      setTempPassword(result.tempPassword);
      setMessage("家庭账号已创建，请妥善保存这次显示的初始密码。");
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建家庭账号失败");
    }
  }

  async function assignTeacher(student: StudentItem) {
    const teacherId = selectedTeachers[student.id];
    if (!teacherId) return;
    setError("");
    setMessage("");
    try {
      await api.post("/api/v1/admin/assignments", { teacherId, studentId: student.id });
      setSelectedTeachers((current) => ({ ...current, [student.id]: "" }));
      setMessage(`已为${student.name}分配老师。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "分配老师失败");
    }
  }

  async function removeTeacher(student: StudentItem, assignmentId: string, teacherName: string) {
    setError("");
    setMessage("");
    try {
      await api.del(`/api/v1/admin/assignments/${assignmentId}`);
      setMessage(`已解除${teacherName}与${student.name}的负责关系。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解除负责关系失败");
    }
  }

  async function disableFamilyAccount(student: StudentItem) {
    if (!confirm(`确认停用${student.name}家庭账号？停用后将无法登录。`)) return;
    setError("");
    setMessage("");
    try {
      await api.del(`/api/v1/admin/students/${student.id}`);
      setMessage(`已停用${student.name}的家庭账号。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "停用失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">学生与家庭账号</h1>
        <button
          className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "取消" : "+ 创建家庭账号"}
        </button>
      </div>
      {message && (
        <div className="rounded bg-green-100 p-3 text-sm text-green-700">
          {message}
          {tempPassword && <div className="mt-2 font-mono text-base">初始密码：{tempPassword}</div>}
        </div>
      )}
      {error && <div className="rounded bg-red-100 p-3 text-sm text-red-700">{error}</div>}
      {showCreate && (
        <form onSubmit={createFamilyAccount} className="grid max-w-3xl gap-3 rounded-xl border border-[#1e2a3a]/10 bg-white p-4 sm:grid-cols-2">
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="家庭手机号（11 位）"
            inputMode="numeric"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            required
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="学生姓名"
            value={form.studentName}
            onChange={(event) => setForm({ ...form, studentName: event.target.value })}
            required
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="年级"
            value={form.grade}
            onChange={(event) => setForm({ ...form, grade: event.target.value })}
          />
          <input
            className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            placeholder="学校"
            value={form.school}
            onChange={(event) => setForm({ ...form, school: event.target.value })}
          />
          <button className="rounded-lg bg-[#e8863a] py-2 font-semibold text-white sm:col-span-2" type="submit">
            创建账号与学生资料
          </button>
        </form>
      )}
      <input
        className="w-full max-w-sm rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
        placeholder="按姓名/年级/学校搜索"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="overflow-x-auto rounded-xl border border-[#1e2a3a]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#1e2a3a]/10 text-left">
            <tr>
              <th className="p-3">姓名 / 状态</th>
              <th className="p-3">年级</th>
              <th className="p-3">学校</th>
              <th className="p-3">家庭手机号</th>
              <th className="p-3">负责老师</th>
              <th className="p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((student) => (
              <tr key={student.id} className="border-b border-[#1e2a3a]/5 align-top">
                <td className="p-3">
                  <div>{student.name}</div>
                  <div className={student.isActive ? "text-xs text-green-700" : "text-xs text-red-600"}>
                    {student.isActive ? "账号正常" : "账号已停用"}
                  </div>
                </td>
                <td className="p-3">{student.grade || "-"}</td>
                <td className="p-3">{student.school || "-"}</td>
                <td className="p-3">{student.familyPhone}</td>
                <td className="p-3">
                  <div className="space-y-1">
                    {student.teachers.map((teacher) => (
                      <div key={teacher.assignmentId} className="flex items-center gap-2">
                        <span>{teacher.name}</span>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeTeacher(student, teacher.assignmentId, teacher.name)}
                        >
                          解除
                        </button>
                      </div>
                    ))}
                    {student.isActive && teachers.some((teacher) => teacher.isActive) && (
                      <div className="flex gap-1">
                        <select
                          className="min-w-0 rounded border border-[#1e2a3a]/20 px-2 py-1"
                          aria-label={`为${student.name}选择老师`}
                          value={selectedTeachers[student.id] ?? ""}
                          onChange={(event) => setSelectedTeachers({ ...selectedTeachers, [student.id]: event.target.value })}
                        >
                          <option value="">选择老师</option>
                          {teachers
                            .filter((teacher) => teacher.isActive && !student.teachers.some((assigned) => assigned.teacherId === teacher.id))
                            .map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                        </select>
                        <button
                          className="whitespace-nowrap rounded border border-[#1e2a3a]/20 px-2 py-1 text-xs disabled:opacity-50"
                          disabled={!selectedTeachers[student.id]}
                          onClick={() => void assignTeacher(student)}
                        >
                          分配
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  {student.isActive && (
                    <button className="whitespace-nowrap text-red-600 hover:underline" onClick={() => void disableFamilyAccount(student)}>
                      停用家庭账号
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="p-4 text-center text-[#526174]" colSpan={6}>没有找到学生</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminStudentsPage() {
  return (
    <AuthGuard>
      <Students />
    </AuthGuard>
  );
}
