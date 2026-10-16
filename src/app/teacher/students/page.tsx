"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface StudentItem {
  assignmentId: string;
  student: { id: string; name: string; grade: string; school: string };
}

function Students() {
  const [items, setItems] = useState<StudentItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ students: StudentItem[] }>("/api/v1/teacher/students")
      .then((d) => {
        if (!cancelled) {
          setItems(d.students);
        }
      }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "加载失败"); });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">我的学生</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.assignmentId} className="rounded-xl border border-[#302a38]/10 bg-white p-4">
            <div className="font-semibold">{item.student.name}</div>
            <div className="mt-1 text-sm text-[#302a38]/60">
              {item.student.grade} ｜ {item.student.school}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#754be6]">
              <Link href={`/wrong-questions?studentId=${encodeURIComponent(item.student.id)}`}>打开错题本</Link>
              <Link href={`/practice?studentId=${encodeURIComponent(item.student.id)}`}>生成模拟练习</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherStudentsPage() {
  return (
    <AuthGuard>
      <Students />
    </AuthGuard>
  );
}
