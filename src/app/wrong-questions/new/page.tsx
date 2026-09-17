"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";

import { api } from "../../../components/api";
import { AuthGuard } from "../../../components/AuthGuard";

// canvas 旋转图片 90 度
function rotateImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        } else {
          reject(new Error("图片处理失败"));
        }
      }, "image/jpeg", 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    img.src = url;
  });
}

function UploadForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState<"MATH" | "ENGLISH">("MATH");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      return;
    }
    if (!["image/jpeg", "image/png"].includes(selected.type)) {
      setError("仅支持 JPG/JPEG/PNG 图片");
      return;
    }
    setError("");
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleRotate() {
    if (!file) {
      return;
    }
    try {
      const rotated = await rotateImage(file);
      setFile(rotated);
      setPreview(URL.createObjectURL(rotated));
    } catch (e) {
      setError(e instanceof Error ? e.message : "旋转失败");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("请先选择图片");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("subject", subject);
      form.append("image", file);
      const data = await api.upload<{ wrongQuestionId: string }>(
        "/api/v1/wrong-questions",
        form,
      );
      router.push(`/wrong-questions/${data.wrongQuestionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">上传错题</h1>
      <p className="text-sm text-[#1e2a3a]/60">每次仅上传一道题</p>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label htmlFor="subject" className="block text-sm text-[#1e2a3a]/70">学科</label>
          <select
            id="subject"
            className="mt-1 w-full rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
            value={subject}
            onChange={(e) => setSubject(e.target.value as "MATH" | "ENGLISH")}
          >
            <option value="MATH">数学</option>
            <option value="ENGLISH">英语</option>
          </select>
        </div>
        <div>
          <button
            type="button"
            className="rounded-lg border border-[#1e2a3a]/20 bg-white px-4 py-2 text-sm"
            onClick={() => fileInput.current?.click()}
          >
            {file ? "重新选择图片" : "选择/拍照"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        {preview && (
          <div className="space-y-2">
            <NextImage
              src={preview}
              alt="预览"
              width={512}
              height={384}
              className="max-h-72 w-auto rounded-lg border"
              unoptimized
            />
            <button
              type="button"
              className="rounded-lg border border-[#1e2a3a]/20 bg-white px-3 py-1 text-sm"
              onClick={handleRotate}
            >
              旋转 90°
            </button>
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          className="w-full rounded-lg bg-[#e8863a] py-2 font-semibold text-white disabled:opacity-50"
          disabled={loading || !file}
        >
          {loading ? "上传中…" : "上传并分析"}
        </button>
      </form>
    </div>
  );
}

export default function NewWrongQuestionPage() {
  return (
    <AuthGuard>
      <UploadForm />
    </AuthGuard>
  );
}
