"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "../../components/api";
import { AuthGuard, type SafeUser } from "../../components/AuthGuard";

function AccountDetails() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    api.get<{ user: SafeUser }>("/api/v1/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "账户信息加载失败"));
  }, []);

  async function logout() {
    setError("");
    try {
      await api.post("/api/v1/auth/logout");
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退出失败");
    }
  }

  return (
    <section className="max-w-xl space-y-5 rounded-xl border border-[#1e2a3a]/10 bg-white p-6">
      <div>
        <h1 className="text-2xl font-bold">账户设置</h1>
        <p className="mt-1 text-sm text-[#1e2a3a]/60">查看登录资料并管理密码。</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {user && (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-[#1e2a3a]/50">姓名</dt><dd className="mt-1 font-medium">{user.name}</dd></div>
          <div><dt className="text-[#1e2a3a]/50">手机号</dt><dd className="mt-1 font-medium">{user.phoneMasked}</dd></div>
          <div><dt className="text-[#1e2a3a]/50">身份</dt><dd className="mt-1 font-medium">{user.role === "FAMILY" ? "家庭" : user.role === "TEACHER" ? "老师" : "管理员"}</dd></div>
        </dl>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/change-password" className="rounded-lg bg-[#e8863a] px-4 py-2 text-sm font-semibold text-white">修改密码</Link>
        <button onClick={() => void logout()} className="rounded-lg border border-[#1e2a3a]/20 px-4 py-2 text-sm">退出登录</button>
      </div>
    </section>
  );
}

export default function AccountPage() {
  return <AuthGuard><AccountDetails /></AuthGuard>;
}
