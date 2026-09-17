"use client";

import { useEffect, useState } from "react";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface StudentItem {
  assignmentId: string;
  student: { id: string; name: string; grade: string; school: string };
}

function Students() {
  const [items, setItems] = useState<StudentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ students: StudentItem[] }>("/api/v1/teacher/students")
      .then((d) => {
        if (!cancelled) {
          setItems(d.students);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">我的学生</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.assignmentId} className="rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
            <div className="font-semibold">{item.student.name}</div>
            <div className="mt-1 text-sm text-[#1e2a3a]/60">
              {item.student.grade} ｜ {item.student.school}
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
