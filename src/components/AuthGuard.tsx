// Centralized application chrome and role-aware navigation.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";

export interface SafeUser {
  id: string;
  role: "ADMIN" | "TEACHER" | "FAMILY";
  name: string;
  phoneMasked: string;
  mustChangePassword: boolean;
}

const menus = {
  FAMILY: [
    { href: "/", label: "学习首页" },
    { href: "/wrong-questions/new", label: "上传错题" },
    { href: "/wrong-questions", label: "错题本" },
    { href: "/review", label: "今日复习" },
    { href: "/practice-sets", label: "数学练习" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 三维作图" },
    { href: "/bookings", label: "课程预约" },
    { href: "/reports", label: "学习总结" },
    { href: "/account", label: "账户设置" },
  ],
  TEACHER: [
    { href: "/", label: "老师工作台" },
    { href: "/teacher/review", label: "AI 错题复核" },
    { href: "/teacher/students", label: "我的学生" },
    { href: "/teacher/summaries", label: "学习总结审核" },
    { href: "/practice-sets", label: "数学模拟题" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 三维作图" },
    { href: "/account", label: "账户设置" },
  ],
  ADMIN: [
    { href: "/", label: "管理首页" },
    { href: "/admin/students", label: "学生管理" },
    { href: "/admin/teachers", label: "老师管理" },
    { href: "/admin/slots", label: "课程时段" },
    { href: "/practice-sets", label: "数学模拟题" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 三维作图" },
    { href: "/account", label: "账户设置" },
  ],
} as const;

function Navigation({ user, pathname }: { user: SafeUser; pathname: string }) {
  return (
    <>
      {menus[user.role].map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
        return (
          <Link key={item.href} href={item.href} className="app-nav-link" aria-current={active ? "page" : undefined}>
            <span aria-hidden className="app-nav-dot" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ user: SafeUser }>("/api/v1/auth/me")
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        if (user.mustChangePassword) router.replace("/change-password");
      })
      .catch(() => { if (!cancelled) router.replace("/login"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post("/api/v1/auth/logout");
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600" role="status">正在进入学习空间…</div>;
  }
  if (!user || user.mustChangePassword) return null;

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="侧边导航">
        <Link href="/" className="app-logo">
          <span className="app-logo-mark">冠</span>
          <span><span className="app-logo-title">黄冠 AI Academy</span><span className="app-logo-subtitle">LEARN WITH CLARITY</span></span>
        </Link>
        <p className="app-sidebar-caption">学习导航 / WORKSPACE</p>
        <nav className="app-nav" aria-label="主导航"><Navigation user={user} pathname={pathname} /></nav>
        <div className="app-sidebar-footer">
          <div className="app-user-name">{user.name}</div>
          <div className="app-user-role">{user.role === "FAMILY" ? "家庭账户" : user.role === "TEACHER" ? "教师账户" : "管理员"}</div>
          <button type="button" className="app-signout" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "正在退出…" : "退出登录 →"}
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <div className="flex items-center gap-3">
            <span className="app-logo-mark !h-9 !w-9 !rounded-xl !text-xl lg:hidden">冠</span>
            <span className="app-topbar-label">AI 驱动的个性化学习平台</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="app-topbar-user">{user.name} · {user.role === "FAMILY" ? "家庭" : user.role === "TEACHER" ? "老师" : "管理员"}</span>
            <Link className="text-sm font-semibold text-[#16677b] lg:hidden" href="/account">账户</Link>
            <button type="button" className="text-sm font-semibold text-[#16677b] lg:hidden" onClick={() => void signOut()} disabled={signingOut}>退出</button>
          </div>
        </header>
        <nav className="app-mobile-nav" aria-label="移动端主导航"><Navigation user={user} pathname={pathname} /></nav>
        <main className="workspace" id="main-content">{children}</main>
      </div>
    </div>
  );
}
