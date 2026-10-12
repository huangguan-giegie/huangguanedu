// 登录守卫：检查会话、处理首次改密，并按角色显示对应导航
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

const ROLE_LABEL: Record<SafeUser["role"], string> = {
  FAMILY: "学生空间",
  TEACHER: "老师空间",
  ADMIN: "管理空间",
};

const NAV_ITEMS: Record<SafeUser["role"], { href: string; label: string; icon: string }[]> = {
  FAMILY: [
    { href: "/", label: "学习总览", icon: "✳" },
    { href: "/wrong-questions", label: "我的错题", icon: "?" },
    { href: "/practice", label: "错题模拟练习", icon: "✎" },
    { href: "/bookings", label: "预约课程", icon: "▦" },
    { href: "/reports", label: "学习总结", icon: "✦" },
    { href: "/account", label: "账户设置", icon: "♙" },
  ],
  TEACHER: [
    { href: "/teacher/review", label: "待复核错题", icon: "✓" },
    { href: "/teacher/students", label: "我的学生", icon: "♙" },
    { href: "/wrong-questions", label: "学生错题本", icon: "?" },
    { href: "/practice", label: "错题模拟练习", icon: "✎" },
    { href: "/teacher/summaries", label: "学习总结审核", icon: "✦" },
    { href: "/account", label: "账户设置", icon: "♙" },
  ],
  ADMIN: [
    { href: "/admin/students", label: "学生管理", icon: "♧" },
    { href: "/admin/teachers", label: "老师管理", icon: "✧" },
    { href: "/admin/slots", label: "课程时段", icon: "◷" },
    { href: "/wrong-questions", label: "学生错题本", icon: "?" },
    { href: "/teacher/review", label: "错题审核", icon: "✓" },
    { href: "/practice", label: "错题模拟练习", icon: "✎" },
    { href: "/teacher/summaries", label: "学习总结审核", icon: "✦" },
    { href: "/account", label: "账户设置", icon: "♙" },
  ],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ user: SafeUser }>("/api/v1/auth/me")
      .then(({ user }) => {
        setUser(user);
        if (user.mustChangePassword) {
          router.replace("/change-password");
        }
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="app-loading">
        <span className="app-brand-mark">冠</span>
        <span>正在打开学习空间…</span>
      </div>
    );
  }
  if (!user) {
    return null;
  }

  const items = NAV_ITEMS[user.role];
  const activeItem = items.find((item) =>
    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const pageTitle = activeItem?.label ?? (pathname.startsWith("/wrong-questions") ? "错题详情" : "学习总览");

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="app-brand">
          <span className="app-brand-mark">冠</span>
          <span>
            黄冠 AI Academy
            <small>让进步看得见</small>
          </span>
        </Link>
        <div className="sidebar-caption">{ROLE_LABEL[user.role]}</div>
        <nav className="app-nav" aria-label="主导航">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="app-nav-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
                {item.href === "/wrong-questions" && <span className="app-nav-count">↗</span>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="study-note">
            <span className="study-note-label">本周寄语</span>
            订正的每一步，<br />都在帮你走得更稳。
          </div>
          <div className="user-chip">
            <span className="user-avatar">{user.name.slice(0, 1)}</span>
            <span className="user-copy">
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
            <button
              type="button"
              className="logout-button"
              aria-label="退出登录"
              title="退出登录"
              onClick={async () => {
                await api.post("/api/v1/auth/logout");
                router.replace("/login");
              }}
            >
              ↗
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <p className="app-breadcrumb">黄冠 AI Academy <span>/</span> {ROLE_LABEL[user.role]}</p>
            <div className="app-title">{pageTitle}</div>
          </div>
          <span className="role-chip">{user.name} · {ROLE_LABEL[user.role]}</span>
        </header>
        <main className="app-content">{children}</main>
        <footer className="app-footer">
          <span>每天进步一点，<b>就是很棒的进步。</b></span>
          <span>黄冠 AI Academy · {ROLE_LABEL[user.role]}</span>
        </footer>
      </div>
    </div>
  );
}
