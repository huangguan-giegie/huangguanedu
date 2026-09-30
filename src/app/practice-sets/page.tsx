"use client";

import { useEffect, useState } from "react";

import { api } from "../../components/api";
import { AuthGuard, type SafeUser } from "../../components/AuthGuard";

interface PracticeQuestion {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
}

interface PracticeSetItem {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  questions: PracticeQuestion[];
  createdAt: string;
}

interface StudentOption {
  id: string;
  name: string;
  grade: string;
}

function PracticeSets() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [items, setItems] = useState<PracticeSetItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadSets() {
    const data = await api.get<{ items: PracticeSetItem[] }>(
      "/api/v1/practice-sets",
    );
    setItems(data.items);
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const { user: currentUser } = await api.get<{ user: SafeUser }>(
          "/api/v1/auth/me",
        );
        if (cancelled) return;
        setUser(currentUser);

        if (currentUser.role === "TEACHER") {
          const data = await api.get<{
            students: {
              student: { id: string; name: string; grade: string };
            }[];
          }>("/api/v1/teacher/students");
          if (!cancelled) {
            const options = data.students.map((item) => item.student);
            setStudents(options);
            setStudentId(options[0]?.id ?? "");
          }
        } else if (currentUser.role === "ADMIN") {
          const data = await api.get<{
            students: StudentOption[];
          }>("/api/v1/admin/students");
          if (!cancelled) {
            setStudents(data.students);
            setStudentId(data.students[0]?.id ?? "");
          }
        }
        await loadSets();
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

  async function generate() {
    if (!studentId) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/v1/practice-sets/generate", { studentId, count });
      await loadSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">数学模拟题</h1>
        <p className="mt-1 text-sm text-[#1e2a3a]/60">
          根据学生近期数学错题和薄弱知识点生成 3–5 道针对性练习。
        </p>
      </div>

      {user && user.role !== "FAMILY" && (
        <section className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
          <h2 className="font-semibold">生成新题组</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-[#1e2a3a]/60">学生</span>
              <select
                className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}（{student.grade}）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#1e2a3a]/60">题目数量</span>
              <select
                className="rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value={3}>3 道</option>
                <option value={4}>4 道</option>
                <option value={5}>5 道</option>
              </select>
            </label>
            <button
              className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !studentId}
              onClick={() => void generate()}
            >
              {busy ? "生成中…" : "生成数学模拟题"}
            </button>
          </div>
        </section>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="space-y-4">
        {items.map((set) => (
          <section
            key={set.id}
            className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">{set.title}</h2>
              <span className="text-xs text-[#1e2a3a]/50">
                {set.studentName} · {new Date(set.createdAt).toLocaleDateString()}
              </span>
            </div>
            <ol className="mt-4 space-y-4">
              {set.questions.map((question, index) => (
                <li key={question.id} className="rounded-lg bg-[#faf6ee] p-4">
                  <p className="font-medium">
                    {index + 1}. {question.question}
                  </p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-[#e8863a]">
                      查看答案与解析
                    </summary>
                    <p className="mt-2">答案：{question.answer}</p>
                    {question.explanation && (
                      <p className="mt-1 text-[#1e2a3a]/70">
                        解析：{question.explanation}
                      </p>
                    )}
                  </details>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {items.length === 0 && !error && (
          <p className="text-sm text-[#1e2a3a]/50">暂无模拟题组</p>
        )}
      </div>
    </div>
  );
}

export default function PracticeSetsPage() {
  return (
    <AuthGuard>
      <PracticeSets />
    </AuthGuard>
  );
}
