"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../components/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/v1/auth/change-password", {
        oldPassword,
        newPassword,
      });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf6ee] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#1e2a3a]/10 bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-[#1e2a3a]">首次登录请修改密码</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="oldPassword" className="block text-sm text-[#1e2a3a]/70">旧密码</label>
            <input
              id="oldPassword"
              className="mt-1 w-full rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm text-[#1e2a3a]/70">新密码（至少 8 位）</label>
            <input
              id="newPassword"
              className="mt-1 w-full rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            className="w-full rounded-lg bg-[#e8863a] py-2 font-semibold text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "提交中…" : "确认修改"}
          </button>
        </form>
      </div>
    </div>
  );
}
