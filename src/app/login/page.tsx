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
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><span className="auth-brand-mark">冠</span>黄冠 AI Academy</div>
        <div className="auth-story-copy">
          <p className="eyebrow">LEARN · REVIEW · GROW</p>
          {/* 品牌宣传语是 L0 展示标题，语义上不是 h1 —— 页面 h1 应是"欢迎回来"。
              与首页同理：AuthGuard 的 .app-title / 这里 <h1> 承担 h1，欢迎语降为 <p>。 */}
          <p className="welcome-title">错题，<br />是下一次做对的线索。</p>
          <p>把每次练习里的小发现收集起来。看懂问题，再一步一步学会。</p>
        </div>
        <div className="auth-story-footer">学习总览　·　错题复盘　·　课程预约</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h1>欢迎回来</h1>
          <p className="auth-lead">登录学习空间，继续今天的进步。</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="phone">手机号</label>
              <input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="请输入手机号"
                inputMode="tel"
                autoComplete="username"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="button-primary" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? "登录中…" : "登录学习空间"}
            </button>
          </form>
          <p className="auth-help">
            请使用管理员分配的手机号和密码登录。首次登录需设置新密码。
          </p>
        </div>
      </section>
    </main>
  );
}
