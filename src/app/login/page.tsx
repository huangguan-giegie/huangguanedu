"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "../../components/api";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ user: { mustChangePassword: boolean } }>(
        "/api/v1/auth/login",
        { phone, password },
      );
      if (data.user.mustChangePassword) {
        router.replace("/change-password");
      } else {
        router.replace("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf6ee] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#1e2a3a]/10 bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-[#1e2a3a]">黄冠AI Academy</h1>
        <p className="mt-1 text-sm text-[#1e2a3a]/60">学生教培学习平台</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm text-[#1e2a3a]/70">手机号</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入手机号"
              inputMode="tel"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-[#1e2a3a]/70">密码</label>
            <input
              className="mt-1 w-full rounded-lg border border-[#1e2a3a]/20 px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            className="w-full rounded-lg bg-[#e8863a] py-2 font-semibold text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "登录中…" : "登录"}
          </button>
        </form>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-4 text-xs text-[#1e2a3a]/50">
            演示账号：13800000001（管理员）/ 13800000002（老师）/ 13800000003（家庭），
            初始密码 Temp@123456
          </p>
        )}
      </div>
    </div>
  );
}
