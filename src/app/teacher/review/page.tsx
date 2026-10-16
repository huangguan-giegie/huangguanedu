"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "../../../components/EmptyState";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface ReviewItem {
  id: string;
  subject: "MATH" | "ENGLISH";
  studentName: string;
  recognizedQuestion: string | null;
  aiConfidence: number | null;
  hasImage: boolean;
}

function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: ReviewItem[] }>("/api/v1/teacher/wrong-questions")
      .then((d) => {
        if (!cancelled) {
          setItems(d.items);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">待复核 AI 错题</h1>
      {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
      {items.length === 0 && !error && (
        <EmptyState title="暂无待复核题目" description="学生提交错题后，需要复核的题目会出现在这里。" actionHref="/teacher/students" actionLabel="查看我的学生" />
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#302a38]/10 bg-white p-4">
            <div>
              <div className="font-semibold">
                {item.recognizedQuestion ?? "（待识别）"}
              </div>
              <div className="mt-1 text-xs text-[#302a38]/50">
                {item.studentName} ｜ {item.subject === "MATH" ? "数学" : "英语"} ｜
                置信度 {item.aiConfidence ?? "-"}
              </div>
            </div>
            <Link
              href={`/wrong-questions/${item.id}`}
              className="rounded-lg bg-[#754be6] px-4 py-1.5 text-sm font-semibold text-white"
            >
              查看并审核
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeacherReviewPage() {
  return (
    <AuthGuard>
      <ReviewQueue />
    </AuthGuard>
  );
}
