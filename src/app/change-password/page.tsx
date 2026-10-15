"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { api } from "../../components/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/v1/auth/change-password", { oldPassword, newPassword });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page--compact">
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand"><span className="auth-brand-mark">冠</span>黄冠 AI Academy</div>
          {/* h2 → h1：本页没有 AuthGuard 的 .app-title（改密页不套壳），
            原先用 <h2> 导致标题层级从 h2 开始、跳过 h1。 */}
          <h1 style={{ marginTop: 22 }}>设置新密码</h1>
          <p className="auth-lead">设置新的登录密码，至少 8 位。</p>
          <Link href="/account" className="inline-flex min-h-[44px] items-center text-sm text-[#754be6]">返回账户设置</Link>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="oldPassword">当前密码</label>
              <input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="newPassword">新密码（至少 8 位）</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="confirmPassword">再次输入新密码</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="button-primary" disabled={loading} aria-busy={loading}>
              {loading ? "保存中…" : "保存并继续"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
