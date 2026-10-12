"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { api } from "../../../components/api";
import { AuthGuard, type SafeUser } from "../../../components/AuthGuard";

// 在浏览器中旋转图片，保留同一道题的页序。
async function rotateImage(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.height;
    canvas.height = image.width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片处理失败");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片处理失败")), "image/jpeg", 0.9));
    return new File([blob], file.name, { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}

function UploadForm() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [subject, setSubject] = useState<"MATH" | "ENGLISH">("MATH");
  const [model, setModel] = useState("qwen3.7-plus");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const previewUrls = useRef<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const maxFiles = subject === "ENGLISH" ? 6 : 1;

  useEffect(() => { void api.get<{ user: SafeUser }>("/api/v1/auth/me").then(({ user }) => setUser(user)).catch((cause) => setError(cause instanceof Error ? cause.message : "加载身份失败")); }, []);
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function replaceFiles(next: File[]) {
    const urls = next.map((file) => URL.createObjectURL(file));
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = urls;
    setFiles(next);
    setPreviews(urls);
    setActivePreview(null);
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    if (selected.some((file) => !["image/jpeg", "image/png"].includes(file.type))) { setError("仅支持 JPG/JPEG/PNG 图片"); return; }
    if (selected.some((file) => file.size > 8 * 1024 * 1024)) { setError("每张图片不能超过 8MB"); return; }
    if (files.length + selected.length > maxFiles) { setError(subject === "ENGLISH" ? "英语阅读长文最多上传 6 张图片" : "数学题每次请上传一张图片"); return; }
    replaceFiles([...files, ...selected]);
    setCreatedId("");
    setError("");
  }

  async function rotate(index: number) {
    setRotating(true);
    setError("");
    try { const rotated = await rotateImage(files[index]); replaceFiles(files.map((file, i) => i === index ? rotated : file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "旋转失败"); }
    finally { setRotating(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length || loading || rotating) return;
    setLoading(true);
    setError("");
    setCreatedId("");
    try {
      const form = new FormData();
      form.append("subject", subject);
      form.append("model", model);
      files.forEach((file) => form.append("image", file));
      const data = await api.upload<{ wrongQuestionId: string }>("/api/v1/wrong-questions", form);
      setCreatedId(data.wrongQuestionId);
      replaceFiles([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "上传失败"); }
    finally { setLoading(false); }
  }

  if (!user) return <p className="text-sm text-[#302a38]/60">{error || "正在打开上传入口…"}</p>;
  if (user.role !== "FAMILY") return <div className="rounded-2xl bg-white p-6"><p>错题由学生或家长上传，老师可在学生错题本中审核和生成练习。</p><Link href="/wrong-questions" className="mt-3 inline-block text-[#754be6]">查看学生错题本 →</Link></div>;
  return (
    <div className="space-y-6">
      <Link href="/wrong-questions" className="text-sm text-[#754be6]">← 返回错题本</Link>
      <div><h1 className="text-2xl font-bold">把这道题，真正弄懂</h1><p className="mt-2 text-sm text-[#302a38]/60">数学上传一道题；英语阅读长文可按顺序上传最多 6 张。每张图片不超过 8MB。</p></div>
      {createdId && <section role="status" className="rounded-2xl border border-[#d7ef67] bg-[#d7ef67]/30 p-5"><h2 className="font-semibold">已提交识别</h2><p className="mt-1 text-sm">AI 正在后台分析，你可以继续上传下一题。</p><div className="mt-3 flex gap-5 text-sm font-semibold text-[#754be6]"><Link href={`/wrong-questions/${createdId}`}>查看这道题 →</Link><Link href="/wrong-questions">去错题本 →</Link></div></section>}
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#302a38]/10 bg-white p-6">
        <div className="flex flex-wrap gap-6"><fieldset><legend className="mb-2 text-sm font-semibold">学科</legend><div className="flex gap-2">{(["MATH", "ENGLISH"] as const).map((value) => <button key={value} type="button" disabled={loading || rotating} aria-pressed={subject === value} onClick={() => { setSubject(value); replaceFiles([]); setError(""); setCreatedId(""); }} className={`rounded-xl px-5 py-2 text-sm ${subject === value ? "bg-[#754be6] text-white" : "bg-[#f3f0ff] text-[#302a38]"}`}>{value === "MATH" ? "数学" : "英语"}</button>)}</div></fieldset><label className="grid content-start gap-2 text-sm font-semibold">识别方式<select disabled={loading} value={model} onChange={(event) => setModel(event.target.value)} className="rounded-xl border border-[#302a38]/15 px-3 py-2 font-normal"><option value="qwen3.7-plus">AI 标准识别（数学、英语、几何）</option></select></label></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{files.map((file, index) => <div key={`${index}-${file.name}`} className="rounded-xl border border-[#302a38]/10 p-3">{previews[index] && <button type="button" aria-label={`放大第 ${index + 1} 张题目预览`} onClick={() => setActivePreview(previews[index])} className="block w-full"><NextImage src={previews[index]} alt={`第 ${index + 1} 张题目预览`} width={600} height={480} unoptimized className="h-48 w-full rounded-lg bg-[#f7f6fa] object-contain" /></button>}<p className="mt-2 truncate text-xs text-[#302a38]/60">第 {index + 1} 张 · {file.name}</p><div className="mt-3 flex gap-4 text-sm text-[#754be6]"><button type="button" disabled={loading || rotating} onClick={() => void rotate(index)}>旋转 90°</button><button type="button" disabled={loading || rotating} onClick={() => replaceFiles(files.filter((_, i) => i !== index))}>移除</button></div></div>)}</div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png" multiple={subject === "ENGLISH"} className="hidden" onChange={handleFile} />
        <div className="flex flex-wrap items-center gap-4"><button type="button" disabled={loading || rotating || files.length >= maxFiles} className="rounded-xl border border-dashed border-[#754be6]/40 bg-[#f3f0ff] px-6 py-4 text-sm font-semibold text-[#754be6] disabled:opacity-40" onClick={() => fileInput.current?.click()}>+ {files.length ? "添加下一张" : "拍照 / 选择图片"}</button><span className="text-sm text-[#302a38]/50">已选 {files.length} / {maxFiles} 张</span>{files.length > 0 && <button type="button" disabled={loading || rotating} onClick={() => replaceFiles([])} className="text-sm text-[#302a38]/60">清空图片</button>}</div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-4 border-t border-[#302a38]/10 pt-5"><button disabled={loading || rotating || !files.length} className="rounded-xl bg-[#754be6] px-7 py-3 font-semibold text-white disabled:opacity-40">{loading ? "上传中，请稍候…" : rotating ? "正在旋转图片…" : "上传并分析 →"}</button><p className="text-xs text-[#302a38]/50">请确保题干、图形和作答过程清晰，原图保留约 90 天。</p></div>
      </form>
      {activePreview && <div role="dialog" aria-modal="true" aria-label="上传图片预览" className="fixed inset-0 z-50 flex items-center justify-center bg-[#302a38]/80 p-5" onClick={() => setActivePreview(null)}><div className="max-h-[95vh] max-w-5xl overflow-auto rounded-2xl bg-white p-4" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex justify-end"><button autoFocus type="button" className="rounded-xl border border-[#302a38]/15 bg-white px-4 py-2 text-sm" onClick={() => setActivePreview(null)}>关闭预览 ✕</button></div><NextImage src={activePreview} alt="放大的待上传题目" width={1600} height={1600} unoptimized className="h-auto max-h-[80vh] w-auto max-w-full object-contain" /></div></div>}
    </div>
  );
}

export default function NewWrongQuestionPage() { return <AuthGuard><UploadForm /></AuthGuard>; }
