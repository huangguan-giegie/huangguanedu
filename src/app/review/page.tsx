"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";

interface ReviewItem {
  id: string;
  subject: "MATH" | "ENGLISH";
  knowledgePoint: string;
  masteryScore: number;
  stability: number;
  difficulty: number;
  reviewCount: number;
  lapseCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  due: boolean;
}

interface ReviewPlan {
  studentId: string;
  dueCount: number;
  averageMastery: number;
  suggestedDifficulty: "EASY" | "MEDIUM" | "HARD";
  items: ReviewItem[];
}

function ReviewDashboard() {
  const router = useRouter();
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await api.get<ReviewPlan>("/api/v1/me/review-plan");
    setPlan(data);
  }

  useEffect(() => {
    load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "复习计划加载失败");
    });
  }, []);

  async function startReview() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/v1/practice-sets/generate", {
        adaptive: true,
        count: 5,
        difficulty: plan.suggestedDifficulty,
      });
      router.push("/practice-sets");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成今日复习失败");
    } finally {
      setBusy(false);
    }
  }

  if (!plan && !error) return <p className="text-sm text-[#1e2a3a]/50">正在生成复习计划…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">今日复习</h1>
        <p className="mt-1 text-sm text-[#1e2a3a]/60">
          根据错题、历史作答和复习间隔安排今天最值得练的知识点。
        </p>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {plan && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
              <div className="text-xs text-[#1e2a3a]/50">今天到期</div>
              <div className="mt-1 text-3xl font-bold">{plan.dueCount}</div>
            </div>
            <div className="rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
              <div className="text-xs text-[#1e2a3a]/50">平均掌握度</div>
              <div className="mt-1 text-3xl font-bold">{plan.averageMastery}%</div>
            </div>
            <div className="rounded-xl border border-[#1e2a3a]/10 bg-white p-4">
              <div className="text-xs text-[#1e2a3a]/50">建议难度</div>
              <div className="mt-2 text-xl font-bold">
                {plan.suggestedDifficulty === "EASY" ? "基础" : plan.suggestedDifficulty === "MEDIUM" ? "中等" : "较难"}
              </div>
            </div>
          </section>
          <button
            className="rounded-lg bg-[#e8863a] px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void startReview()}
          >
            {busy ? "正在生成…" : "生成今日 5 道自适应练习"}
          </button>
          <section className="rounded-xl border border-[#1e2a3a]/10 bg-white">
            <div className="border-b border-[#1e2a3a]/10 p-4 font-semibold">知识点掌握度</div>
            <div className="divide-y divide-[#1e2a3a]/5">
              {plan.items.map((item) => (
                <div key={item.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_120px_180px] sm:items-center">
                  <div>
                    <div className="font-medium">{item.knowledgePoint}</div>
                    <div className="mt-1 text-xs text-[#1e2a3a]/50">
                      {item.subject === "MATH" ? "数学" : "英语"} · 复习 {item.reviewCount} 次 · 失误 {item.lapseCount} 次
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className={item.masteryScore >= 80 ? "text-green-700" : item.masteryScore >= 55 ? "text-amber-700" : "text-red-600"}>
                      {item.masteryScore}%
                    </span>
                  </div>
                  <div className="text-sm text-[#1e2a3a]/60">
                    {item.due
                      ? "现在应复习"
                      : item.nextReviewAt
                        ? `下次：${new Date(item.nextReviewAt).toLocaleDateString()}`
                        : "待安排"}
                  </div>
                </div>
              ))}
              {plan.items.length === 0 && (
                <p className="p-4 text-sm text-[#1e2a3a]/50">还没有可计算的知识点，先上传错题或完成练习。</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <AuthGuard>
      <ReviewDashboard />
    </AuthGuard>
  );
}
