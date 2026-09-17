"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

interface WrongQuestionDetail {
  wrongQuestion: {
    id: string;
    status: string;
    subject: "MATH" | "ENGLISH";
    recognizedQuestion: string | null;
    thinkingHint: string | null;
    errorCauses: string[] | null;
    knowledgePoints: string[];
    correctSteps: string[] | null;
    finalAnswer: string | null;
    remedialPractice: string[] | null;
    aiConfidence: number | null;
    isAiGenerated: boolean;
    isTeacherReviewed: boolean;
    studentWorkTranscription: string | null;
    studentApproach: string | null;
    firstErrorStep: string | null;
    misconception: string | null;
  };
}

function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<WrongQuestionDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api.get<{ wrongQuestion: WrongQuestionDetail["wrongQuestion"] }>(
      `/api/v1/wrong-questions/${id}`,
    );
    setData(d);
  }

  useEffect(() => {
    let cancelled = false;
    const timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
      void run();
    }, 3000);
    async function run() {
      try {
        const d = await api.get<{ wrongQuestion: WrongQuestionDetail["wrongQuestion"] }>(
          `/api/v1/wrong-questions/${id}`,
        );
        if (cancelled) {
          return;
        }
        setData(d);
        if (d.wrongQuestion.status !== "PROCESSING" && timer) {
          clearInterval(timer);
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
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [id]);

  async function sendFeedback(feedback: "ACCURATE" | "NEEDS_REVIEW") {
    setBusy(true);
    try {
      await api.post(`/api/v1/wrong-questions/${id}/feedback`, { feedback });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="text-[#1e2a3a]/50">加载中…</div>;
  }

  const w = data.wrongQuestion;
  return (
    <div className="space-y-6">
      <Link href="/wrong-questions" className="text-sm text-[#e8863a] hover:underline">
        ← 返回错题本
      </Link>
      <h1 className="text-2xl font-bold">
        {w.subject === "MATH" ? "数学" : "英语"}错题详情
        <span className="ml-3 align-middle text-sm font-normal text-[#1e2a3a]/50">
          {w.status === "PROCESSING" && "AI 分析中…"}
          {w.status === "PENDING_STUDENT_CONFIRMATION" && "等待你确认识别结果"}
          {w.status === "PUBLISHED" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">AI 初步生成</span>
          )}
          {w.status === "NEEDS_REVIEW" && "待老师复核"}
          {w.status === "REVIEWED" && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">老师已审核</span>
          )}
        </span>
      </h1>

      {w.status === "PROCESSING" && (
        <p className="text-sm text-[#1e2a3a]/60">正在识别题目与学生过程，请稍候…</p>
      )}

      {w.status !== "PROCESSING" && (
        <>
          {/* 第一层：识别结果与思路 */}
          <section className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
            <h2 className="font-semibold">一、题目识别与思路提示</h2>
            <p className="mt-2">{w.recognizedQuestion}</p>
            {w.studentWorkTranscription && (
              <p className="mt-2 text-sm text-[#1e2a3a]/70">
                学生过程：{w.studentWorkTranscription}
              </p>
            )}
            {w.studentApproach && (
              <p className="mt-1 text-sm text-[#1e2a3a]/70">
                解题思路：{w.studentApproach}
              </p>
            )}
            {w.thinkingHint && (
              <p className="mt-3 rounded bg-[#faf6ee] p-3 text-sm">
                思路提示：{w.thinkingHint}
              </p>
            )}
          </section>

          {/* 第二层：错误原因与知识点 */}
          <section className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
            <h2 className="font-semibold">二、错误原因与知识点</h2>
            {w.firstErrorStep && (
              <p className="mt-2 text-sm">首个错误步骤：{w.firstErrorStep}</p>
            )}
            {w.misconception && (
              <p className="mt-1 text-sm">错误概念：{w.misconception}</p>
            )}
            <ul className="mt-2 list-inside list-disc text-sm">
              {(w.errorCauses ?? []).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {w.knowledgePoints.map((p) => (
                <span key={p} className="rounded bg-[#faf6ee] px-2 py-0.5">
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* 第三层：完整解答（学生确认前不展示给异常题？确认后展示） */}
          <section className="rounded-xl border border-[#1e2a3a]/10 bg-white p-5">
            <h2 className="font-semibold">三、完整解答</h2>
            {w.status === "PENDING_STUDENT_CONFIRMATION" ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-[#1e2a3a]/70">
                  题目和你的解题过程识别准确吗？（确认后即可查看完整解答与解析）
                </p>
                <div className="flex gap-3">
                  <button
                    className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => sendFeedback("ACCURATE")}
                  >
                    识别准确
                  </button>
                  <button
                    className="rounded-lg border border-[#1e2a3a]/20 bg-white px-4 py-2 text-sm disabled:opacity-50"
                    disabled={busy}
                    onClick={() => sendFeedback("NEEDS_REVIEW")}
                  >
                    需要老师审核
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
                  {(w.correctSteps ?? []).map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
                <p className="mt-3 font-semibold">答案：{w.finalAnswer}</p>
                {(w.remedialPractice ?? []).length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">推荐补救练习</p>
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {w.remedialPractice!.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function WrongQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <AuthGuard>
      <Detail params={params} />
    </AuthGuard>
  );
}
