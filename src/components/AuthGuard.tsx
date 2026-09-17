// 登录守卫：客户端检查 /auth/me，未登录跳转 /login，首次登录强制改密
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "./api";

export interface SafeUser {
  id: string;
  role: "ADMIN" | "TEACHER" | "FAMILY";
  name: string;
  phoneMasked: string;
  mustChangePassword: boolean;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: SafeUser }>("/api/v1/auth/me")
      .then(({ user }) => {
        setUser(user);
        if (user.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf6ee] text-[#1e2a3a]">
        加载中…
      </div>
    );
  }
  if (!user) {
    return null;
  }
  return (
    <div className="min-h-screen bg-[#faf6ee] text-[#1e2a3a]">
      <nav className="flex items-center justify-between border-b border-[#1e2a3a]/10 bg-white/70 px-6 py-3">
        <span className="font-bold text-[#1e2a3a]">黄冠AI Academy</span>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {user.name}（{user.role === "FAMILY" ? "家庭" : user.role === "TEACHER" ? "老师" : "管理员"}）
          </span>
          <button
            className="text-[#e8863a] hover:underline"
            onClick={async () => {
              await api.post("/api/v1/auth/logout");
              router.replace("/login");
            }}
          >
            退出
          </button>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
