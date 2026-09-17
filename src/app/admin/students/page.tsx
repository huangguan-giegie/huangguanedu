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
  teachers: { name: string }[];
}

function Students() {
  const [items, setItems] = useState<StudentItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const params = keyword
          ? `?keyword=${encodeURIComponent(keyword)}`
          : "";
        const d = await api.get<{ students: StudentItem[] }>(
          `/api/v1/admin/students${params}`,
        );
        if (!cancelled) {
          setItems(d.students);
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
  }, [keyword]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">学生管理</h1>
      <input
        className="w-full max-w-sm rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
        placeholder="按姓名/年级/学校搜索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <table className="w-full rounded-xl border border-[#1e2a3a]/10 bg-white text-sm">
        <thead className="border-b border-[#1e2a3a]/10 text-left">
          <tr>
            <th className="p-3">姓名</th>
            <th className="p-3">年级</th>
            <th className="p-3">学校</th>
            <th className="p-3">家庭手机号</th>
            <th className="p-3">负责老师</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-[#1e2a3a]/5">
              <td className="p-3">{s.name}</td>
              <td className="p-3">{s.grade}</td>
              <td className="p-3">{s.school}</td>
              <td className="p-3">{s.familyPhone}</td>
              <td className="p-3">{s.teachers.map((t) => t.name).join("、") || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
