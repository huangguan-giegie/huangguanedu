"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { api } from "../../components/api";
import { AuthGuard } from "../../components/AuthGuard";
import { Icon } from "../../components/icons";
import { isPracticeGenerating, togglePracticeSource, type PracticeGenerationTask, type PracticeSetItem } from "../../components/practice-content";
import { latexToUnicode } from "../../lib/latex-to-unicode";
import { EmptyState } from "../../components/EmptyState";
import styles from "./practice.module.css";

interface SourceData {
  students: { id: string; name: string }[];
  studentId: string | null;
  items: {
    id: string;
    subject: "MATH" | "ENGLISH";
    recognizedQuestion: string | null;
    knowledgePoints: string[];
  }[];
}

const DIFFICULTIES = [
  { value: "EASY", label: "基础巩固", hint: "练稳核心知识" },
  { value: "MEDIUM", label: "中等进阶", hint: "尝试不同问法" },
  { value: "HARD", label: "挑战提升", hint: "练习综合运用" },
] as const;

function PracticeSets({ initialStudentId, initialWrongQuestionId, initialSubject }: { initialStudentId: string; initialWrongQuestionId: string; initialSubject: "MATH" | "ENGLISH" }) {
  const [sources, setSources] = useState<SourceData | null>(null);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [subject, setSubject] = useState<"MATH" | "ENGLISH">(initialSubject);
  const initialSelection = useRef(initialWrongQuestionId);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<PracticeSetItem[]>([]);
  const [task, setTask] = useState<PracticeGenerationTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setsLoading, setSetsLoading] = useState(true);
  const [taskLoading, setTaskLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [reload, setReload] = useState(0);
  const [pollRetry, setPollRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ subject });
    if (studentId) params.set("studentId", studentId);
    api.get<SourceData>(`/api/v1/practice-sets/sources?${params}`)
      .then((data) => {
        if (cancelled) return;
        setSources(data);
        setStudentId(data.studentId ?? "");
        setSelectedIds(data.items.some((item) => item.id === initialSelection.current) ? [initialSelection.current] : []);
        initialSelection.current = "";
        setError("");
        setLoading(false);
      }).catch((cause) => {
        if (cancelled) return;
        setSources(null);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "错题加载失败");
      });
    return () => { cancelled = true; };
  }, [studentId, subject, reload]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ items: PracticeSetItem[] }>("/api/v1/practice-sets")
      .then((data) => { if (!cancelled) { setItems(data.items); setSetsLoading(false); } })
      .catch((cause) => {
        if (!cancelled) {
          setSetsLoading(false);
          setError(cause instanceof Error ? cause.message : "模拟题加载失败");
        }
      });
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    // 用服务端任务恢复生成状态，刷新页面也不会重复提交。
    api.get<{ items: PracticeGenerationTask[] }>("/api/v1/practice-sets/generate/status")
      .then((data) => {
        if (!cancelled) {
          setTask((current) => current ?? data.items.find((item) => isPracticeGenerating(item)) ?? null);
          setTaskLoading(false);
        }
      }).catch((cause) => {
        if (!cancelled) {
          setTaskLoading(false);
          setPollError(cause instanceof Error ? cause.message : "生成任务加载失败");
        }
      });
    return () => { cancelled = true; };
  }, [pollRetry]);

  const jobId = isPracticeGenerating(task) ? task!.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    async function poll() {
      try {
        const result = await api.get<PracticeGenerationTask>(`/api/v1/practice-sets/generate/status?jobId=${encodeURIComponent(jobId!)}`);
        if (cancelled) return;
        failures = 0;
        setPollError("");
        setTask(result);
        if (result.status === "DONE") {
          setSelectedIds([]);
          setReload((value) => value + 1);
        } else if (isPracticeGenerating(result)) {
          timer = setTimeout(() => void poll(), 3000);
        }
      } catch (cause) {
        if (cancelled) return;
        failures += 1;
        setPollError(cause instanceof Error ? cause.message : "暂时无法获取生成状态");
        if (failures < 5) timer = setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobId, pollRetry]);

  async function generate() {
    if (!studentId || !selectedIds.length || submitting || taskLoading || isPracticeGenerating(task)) return;
    setSubmitting(true);
    setError("");
    setPollError("");
    try {
      const result = await api.post<{ jobId: string; studentId: string; status: "PENDING" | "PROCESSING" }>("/api/v1/practice-sets/generate", {
        studentId, wrongQuestionIds: selectedIds, difficulty,
      });
      setTask({ ...result, error: null, practiceSetId: null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模拟题生成失败，请重试");
    } finally { setSubmitting(false); }
  }

  const busy = submitting || isPracticeGenerating(task);
  const visibleSets = items.filter((item) => !studentId || item.studentId === studentId);
  const selectable = sources?.items.filter((item) => item.recognizedQuestion?.trim()) ?? [];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>错题 → 新练习</p><p className={styles.heroTitle}>换个问法，再进步一步。</p><p>从数学、英语错题中挑选薄弱知识点，生成适合你的模拟题。</p></div>
        <span className={styles.heroMark} aria-hidden="true"><Icon name="sparkle" size={110} /></span>
      </section>

      {/* 步骤指示器（数字优于圆点：圆点只表达"有几个点"，数字能表达"第几步 /
          共几步"；连线让 3 个徽章成为一条"路径"而不是 3 个并列标签）。
          状态同时用三通道表达：颜色 + 图形（勾/数字）+ sr-only 文字。 */}
      <nav aria-label="生成练习流程">
        <ol className="stepper" data-step-count="3">
          <li className={`stepper__item ${selectedIds.length ? "is-done" : "is-current"}`} aria-current={selectedIds.length ? undefined : "step"}>
            <span className="stepper__badge" aria-hidden="true">
              {selectedIds.length ? <Icon name="check" size={14} /> : "01"}
            </span>
            <span className="stepper__text">选择原题</span>
            {selectedIds.length && <span className="sr-only">已完成</span>}
          </li>
          <li className={`stepper__item ${selectedIds.length ? "is-current" : "is-todo"}`} aria-current={selectedIds.length ? "step" : undefined}>
            <span className="stepper__badge" aria-hidden="true">02</span>
            <span className="stepper__text">练习难度</span>
          </li>
          <li className={`stepper__item ${selectedIds.length ? "is-todo" : "is-todo"}`}>
            <span className="stepper__badge" aria-hidden="true">03</span>
            <span className="stepper__text">生成</span>
          </li>
        </ol>
      </nav>

      <section className={styles.panel} aria-labelledby="generate-heading">
        <div className={styles.sectionHead}><div><h2 id="generate-heading">生成新练习</h2><p>选择错题与难度，一次最多选择 20 道错题。</p></div><span className={styles.count}>{selectedIds.length} / 20 已选</span></div>
        <div className={styles.filters}>
          <label className={styles.field}><span>练习学生</span><select aria-label="练习学生" value={studentId} disabled={busy || !sources?.students.length} onChange={(event) => { setLoading(true); setSelectedIds([]); setStudentId(event.target.value); }}>
            {!sources?.students.length && <option value="">暂无可选学生</option>}
            {sources?.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select></label>
          <fieldset className={styles.subjects}><legend>学科</legend>{([{ value: "MATH", label: "数学" }, { value: "ENGLISH", label: "英语" }] as const).map((option) => <button type="button" key={option.value} aria-pressed={subject === option.value} className={subject === option.value ? styles.activeTab : styles.tab} disabled={busy} onClick={() => { if (subject === option.value) return; setLoading(true); setSelectedIds([]); setSubject(option.value); }}>{option.label}</button>)}</fieldset>
        </div>

        {error && <p className={styles.error} role="alert">{error} <button type="button" className={styles.textButton} onClick={() => { setLoading(true); setReload((value) => value + 1); }}>重新加载</button></p>}
        {task && <div className={task.status === "FAILED" ? styles.error : styles.task} role="status" aria-live="polite" aria-atomic="true">
          <strong>{task.status === "PENDING" ? "生成任务已提交" : task.status === "PROCESSING" ? "正在生成模拟题…" : task.status === "DONE" ? "新练习已生成" : "本次生成未完成"}{sources?.students.find((student) => student.id === task.studentId)?.name ? ` · ${sources.students.find((student) => student.id === task.studentId)!.name}` : ""}</strong>
          {isPracticeGenerating(task) && <p>正在出题并准备所需图形。可以刷新页面，任务会继续运行。</p>}
          {task.status === "FAILED" && <p>{task.error ?? "请稍后重新生成。"}</p>}
          {task.status === "DONE" && task.practiceSetId && <Link className={styles.textButton} href={`/practice/${task.practiceSetId}`}>查看新练习 →</Link>}
        </div>}
        {pollError && <p className={styles.error} role="alert">{pollError} <button type="button" className={styles.textButton} onClick={() => setPollRetry((value) => value + 1)}>重新获取状态</button></p>}

        {loading ? <p className={styles.empty}>正在加载错题…</p> : !selectable.length ? <EmptyState title={`当前没有可用于生成的${subject === "MATH" ? "数学" : "英语"}错题`} description="错题完成识别后才能用来出题。先上传一道题，识别完再回来生成练习。" actionHref="/wrong-questions" actionLabel="去错题本看看" /> : <>
          <div className={styles.selectionHead}><span>已选 <b>{selectedIds.length}</b> / 20 道</span><button type="button" disabled={busy} className={styles.textButton} onClick={() => setSelectedIds(selectedIds.length ? [] : selectable.slice(0, 20).map((item) => item.id))}>{selectedIds.length ? "取消选择" : `选择${selectable.length > 20 ? "前 20 道" : "全部"}`}</button></div>
          <div className={styles.sources}>{selectable.map((item, index) => {
            const checked = selectedIds.includes(item.id);
            return <label key={item.id} className={`${styles.source}${checked ? ` ${styles.selectedSource}` : ""}`}><input type="checkbox" checked={checked} disabled={busy || (!checked && selectedIds.length >= 20)} onChange={() => setSelectedIds((ids) => togglePracticeSource(ids, item.id))} aria-label={`选择第 ${index + 1} 道错题`} /><div><p className={styles.sourceText}>{latexToUnicode(item.recognizedQuestion ?? "")}</p><div className={styles.tags}>{item.knowledgePoints.length ? item.knowledgePoints.map((point) => <span key={point}>{point}</span>) : <span>综合练习</span>}</div></div></label>;
          })}</div>
        </>}

        <fieldset className={styles.difficulties}><legend>练习难度</legend>{DIFFICULTIES.map((option) => <label key={option.value} className={difficulty === option.value ? styles.activeDifficulty : styles.difficulty}><input type="radio" name="difficulty" value={option.value} checked={difficulty === option.value} disabled={busy} onChange={() => setDifficulty(option.value)} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}</fieldset>
        <div className={styles.generateFooter}><p>几何与函数题会结合原题内容生成配图。</p><button type="button" className="button-primary" disabled={busy || taskLoading || loading || !studentId || !selectedIds.length} onClick={() => void generate()}>{busy ? "正在生成…" : `生成针对性练习${selectedIds.length ? `（已选 ${selectedIds.length} 道）` : ""}`}</button></div>
      </section>

      <section aria-labelledby="history-heading"><div className={styles.sectionHead}><div><h2 id="history-heading">我的模拟题</h2><p>每次练习，都从上一次的薄弱点出发。</p></div><span className={styles.count}>{visibleSets.length} 组练习</span></div>
        {setsLoading ? <p className={styles.empty}>正在加载练习…</p> : visibleSets.length ? <div className={styles.sets}>{visibleSets.map((set) => <Link href={`/practice/${set.id}`} key={set.id} className={styles.setCard}><span className={styles.setIcon} aria-hidden="true"><Icon name="practice" size={22} /></span><div><h3>{set.title}</h3><p>{set.studentName} · {set.questions.length} 道题 · {new Date(set.createdAt).toLocaleDateString("zh-CN")}</p></div><span className={styles.setArrow} aria-hidden="true"><Icon name="arrow-right" size={18} /></span></Link>)}</div> : <EmptyState title="还没有模拟题" description="在上方选好原题与难度，点「生成针对性练习」，结果会出现在这里。" />}
      </section>
    </div>
  );
}

export default function PracticePage({ searchParams }: { searchParams: Promise<{ studentId?: string; wrongQuestionId?: string; subject?: string }> }) {
  const params = use(searchParams);
  return <AuthGuard><PracticeSets initialStudentId={params.studentId ?? ""} initialWrongQuestionId={params.wrongQuestionId ?? ""} initialSubject={params.subject === "ENGLISH" ? "ENGLISH" : "MATH"} /></AuthGuard>;
}
