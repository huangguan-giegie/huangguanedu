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
        "/api/v1/auth/login", { phone, password },
      );
      router.replace(data.user.mustChangePassword ? "/change-password" : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-feature">
        <div className="app-logo">
          <span className="app-logo-mark">冠</span>
          <span><span className="app-logo-title">黄冠 AI Academy</span><span className="app-logo-subtitle">LEARN WITH CLARITY</span></span>
        </div>
        <h1>每一步进步，<br />都值得被看见。</h1>
        <p>AI 智能错题分析、个性化数学练习与专业教师指导，为每一位学生建立清晰的成长路径。</p>
        <div className="mt-12 flex flex-wrap gap-3 text-xs text-cyan-100">
          <span className="rounded-full border border-white/20 px-4 py-2">精准诊断</span>
          <span className="rounded-full border border-white/20 px-4 py-2">循序练习</span>
          <span className="rounded-full border border-white/20 px-4 py-2">学习可追踪</span>
        </div>
      </section>
      <main className="login-form-area">
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">欢迎登录</h2>
          <p className="mt-2 text-sm text-slate-500">继续你的专属学习之旅</p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-phone" className="field-label">手机号</label>
              <input id="login-phone" className="field-control" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="请输入手机号" inputMode="tel" autoComplete="username" required />
            </div>
            <div>
              <label htmlFor="login-password" className="field-label">密码</label>
              <input id="login-password" className="field-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" required />
            </div>
            {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "正在登录…" : "登录学习空间 →"}
            </button>
          </form>
          {process.env.NODE_ENV !== "production" && (
            <p className="mt-6 text-xs leading-relaxed text-slate-400">
              演示账号：13800000001（管理员）/ 13800000002（老师）/ 13800000003（家庭），初始密码 Temp@123456
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
