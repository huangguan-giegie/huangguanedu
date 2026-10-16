"use client";

import { useState } from "react";

import { api } from "./api";
import { MathAnswerInput } from "./MathAnswerInput";
import { TutorPanel } from "./TutorPanel";
import styles from "./PracticeAnswerBox.module.css";

interface AttemptResult {
  id: string;
  answer: string;
  result: "CORRECT" | "PARTIAL" | "INCORRECT";
  score: number;
  feedback: string | null;
  gradingMethod: string;
  attemptedAt: string;
}

interface MasteryUpdate {
  knowledgePoint: string;
  masteryScore: number;
  nextReviewAt: string | null;
}

const RESULT_STYLE: Record<AttemptResult["result"], { label: string; tone: string }> = {
  CORRECT: { label: "答对了", tone: "correct" },
  PARTIAL: { label: "部分正确", tone: "partial" },
  INCORRECT: { label: "还不对", tone: "incorrect" },
};

/**
 * 单题作答区：输入答案 → 确定性判分 → 展示反馈与掌握度变化。
 *
 * 判分与掌握度回填都在服务端完成（POST /api/v1/practice-questions/:id/attempts），
 * 这里只负责收集输入与呈现结果。每次提交都会覆盖展示，但历史作答保留在库中，
 * 掌握度按SM-2 逐次累积。
 */
export function PracticeAnswerBox({
  practiceQuestionId,
  subject,
}: {
  practiceQuestionId: string;
  subject: "MATH" | "ENGLISH";
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [mastery, setMastery] = useState<MasteryUpdate[]>([]);

  async function submit() {
    const text = answer.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ attempt: AttemptResult; mastery: MasteryUpdate[] }>(
        `/api/v1/practice-questions/${encodeURIComponent(practiceQuestionId)}/attempts`,
        { answer: text },
      );
      setAttempt(result.attempt);
      setMastery(result.mastery);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  const style = attempt ? RESULT_STYLE[attempt.result] : null;

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <strong>先自己做一遍</strong>
        <TutorPanel practiceQuestionId={practiceQuestionId} />
      </div>

      {subject === "MATH" ? (
        <MathAnswerInput
          value={answer}
          onChange={setAnswer}
          disabled={busy}
          placeholder="写出你的答案，支持公式键盘"
        />
      ) : (
        <textarea
          className={styles.textarea}
          value={answer}
          disabled={busy}
          maxLength={4000}
          rows={3}
          placeholder="写下你的答案或阅读理解要点"
          onChange={(event) => setAnswer(event.target.value)}
        />
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="button-primary"
          disabled={busy || !answer.trim()}
          onClick={() => void submit()}
        >
          {busy ? "判分中…" : "提交答案"}
        </button>
        {attempt && (
          <button
            type="button"
            className={styles.reset}
            disabled={busy}
            onClick={() => {
              setAnswer("");
              setAttempt(null);
              setMastery([]);
              setError("");
            }}
          >
            重做这题
          </button>
        )}
      </div>

      {error && (
        <p className={`${styles.feedback} ${styles.incorrect}`} role="alert">
          {error}
        </p>
      )}

      {attempt && style && (
        <div className={`${styles.feedback} ${styles[style.tone]}`} role="status">
          <div className={styles.resultLine}>
            <strong>{style.label}</strong>
            <span>得分 {attempt.score}</span>
            {attempt.gradingMethod === "AI" && <span className={styles.tag}>AI 判题</span>}
          </div>
          {attempt.feedback && <p>{attempt.feedback}</p>}
          {mastery.length > 0 && (
            <p className={styles.mastery}>
              已更新掌握度：
              {mastery
                .map(
                  (item) =>
                    `${item.knowledgePoint} ${item.masteryScore}%` +
                    (item.nextReviewAt
                      ? `（下次复习 ${new Date(item.nextReviewAt).toLocaleDateString("zh-CN")}）`
                      : ""),
                )
                .join("；")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}