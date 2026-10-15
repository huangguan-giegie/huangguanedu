// 登录守卫：检查会话、处理首次改密，并按角色显示对应导航
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { api } from "./api";
import { Icon, type IconName } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

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

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: Record<SafeUser["role"], NavItem[]> = {
  FAMILY: [
    { href: "/", label: "学习总览", icon: "home" },
    { href: "/wrong-questions", label: "我的错题", icon: "wrong-question" },
    { href: "/practice", label: "错题模拟练习", icon: "practice" },
    { href: "/review", label: "智能复习", icon: "smart-review" },
    { href: "/bookings", label: "预约课程", icon: "booking" },
    { href: "/reports", label: "学习总结", icon: "report" },
    { href: "/account", label: "账户设置", icon: "account" },
  ],
  TEACHER: [
    { href: "/teacher/review", label: "待复核错题", icon: "pending-review" },
    { href: "/teacher/students", label: "我的学生", icon: "students" },
    { href: "/wrong-questions", label: "学生错题本", icon: "wrong-question" },
    { href: "/practice", label: "错题模拟练习", icon: "practice" },
    { href: "/review", label: "智能复习", icon: "smart-review" },
    { href: "/teacher/summaries", label: "学习总结审核", icon: "summary-review" },
    { href: "/account", label: "账户设置", icon: "account" },
  ],
  ADMIN: [
    { href: "/admin/students", label: "学生管理", icon: "student-management" },
    { href: "/admin/teachers", label: "老师管理", icon: "teacher-management" },
    { href: "/admin/slots", label: "课程时段", icon: "slots" },
    { href: "/wrong-questions", label: "学生错题本", icon: "wrong-question" },
    { href: "/teacher/review", label: "错题审核", icon: "pending-review" },
    { href: "/practice", label: "错题模拟练习", icon: "practice" },
    { href: "/teacher/summaries", label: "学习总结审核", icon: "summary-review" },
    { href: "/account", label: "账户设置", icon: "account" },
  ],
};

/**
 * 移动端一级入口（4 个 Tab）。
 *
 * 关键设计决策：移动端一级入口**不是桌面导航的等比缩小**，而是按使用频次
 * 重新排序。7 项塞进 4 个 Tab 是错的。
 *  - FAMILY：错题是入口（每天上传/看）→ 智能复习是每日行为 → 模拟练习放"更多"
 *    是有争议的选择（它是"看完错题后的自然下一步"），但它属任务型而非浏览型，
 *    且频次次高，放"更多"可接受，落地后应按埋点数据复核。
 *  - TEACHER：待复核是工作驱动的第一项（老师上班第一件事）→ 我的学生日常跟进。
 *  - ADMIN：学生 > 老师 > 课程时段，排课虽是周期性任务但它是独立的操作闭环。
 */
const MOBILE_TABS: Record<SafeUser["role"], { label: string; icon: IconName; match: string }[]> = {
  FAMILY: [
    { label: "总览", icon: "home", match: "/" },
    { label: "错题", icon: "wrong-question", match: "/wrong-questions" },
    { label: "复习", icon: "smart-review", match: "/review" },
    { label: "更多", icon: "filter", match: "__more__" },
  ],
  TEACHER: [
    { label: "待复核", icon: "pending-review", match: "/teacher/review" },
    { label: "学生", icon: "students", match: "/teacher/students" },
    { label: "复习", icon: "smart-review", match: "/review" },
    { label: "更多", icon: "filter", match: "__more__" },
  ],
  ADMIN: [
    { label: "学生", icon: "student-management", match: "/admin/students" },
    { label: "老师", icon: "teacher-management", match: "/admin/teachers" },
    { label: "时段", icon: "slots", match: "/admin/slots" },
    { label: "更多", icon: "filter", match: "__more__" },
  ],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * 抽屉"在哪个路由上打开"，而不是一个 boolean。
   * 这样「路由一变就自动收起」是**派生**出来的，不需要在 effect 里 setState
   * （React 19 的 react-hooks/set-state-in-effect 与 react-hooks/refs 都禁止
   * 那种写法），也不会有 ref 在渲染期被读写的隐患。
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  const moreOpen = openedAt === pathname;
  const openMore = useCallback(() => setOpenedAt(pathname), [pathname]);

  /** 关闭抽屉并把焦点交还给触发按钮（否则焦点会丢在已卸载的节点上） */
  const closeMore = useCallback(() => {
    setOpenedAt(null);
    // 焦点归还必须等抽屉卸载后，否则会把焦点塞进即将消失的节点
    window.requestAnimationFrame(() => moreButtonRef.current?.focus());
  }, []);

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

  // 抽屉开合时锁定背景滚动 + ESC 关闭 + 焦点陷阱。
// 抽屉遮住内容时若不做这三件事，键盘用户会 Tab 到遮罩后面看不见的元素上 ——
// 这是无障碍缺陷，不是打磨项。
useEffect(() => {
  if (!moreOpen) return;
  const panel = moreRef.current;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  panel?.querySelector<HTMLElement>("a, button")?.focus();

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeMore();
      return;
    }
    if (event.key !== "Tab" || !panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", onKeyDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = previousOverflow;
  };
}, [moreOpen, closeMore]);

  if (loading) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="app-brand-mark">冠</span>
        <span>正在打开学习空间…</span>
      </div>
    );
  }
  if (!user) {
    return null;
  }

  const items = NAV_ITEMS[user.role];
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const activeItem = items.find((item) => isActive(item.href));
  const pageTitle = activeItem?.label ?? (pathname.startsWith("/wrong-questions") ? "错题详情" : "学习总览");

  const tabs = MOBILE_TABS[user.role];
  const moreItems = items.filter((item) => !tabs.some((tab) => tab.match === item.href));

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
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {/* Icon 内部已自动加 aria-hidden（纯装饰），不再重复标 */}
                <span className="app-nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                {item.label}
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
            {/* 主题与退出另起一行：在 244px 侧栏里与名字并排会把名字挤成"系…" */}
            <span className="user-chip__actions">
              <ThemeToggle />
              <button
                type="button"
                className="logout-button"
                onClick={async () => {
                  await api.post("/api/v1/auth/logout");
                  router.replace("/login");
                }}
              >
                <Icon name="logout" size={18} label="退出登录" />
              </button>
            </span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        {/* 全局状态播报区：视觉隐藏、读屏可见。单页应用换页时读屏用户没有任何
            反馈（视觉用户看到的是整页替换），这里播报当前页面名。
            内容直接由 pathname 派生，不进 state —— 派生值不需要 effect。 */}
        <div className="app-status-live" role="status" aria-live="polite" aria-atomic="true">
          {`已进入${pageTitle}`}
        </div>
        <header className="app-topbar">
          <div>
            {/* 面包屑 = 空间名 + 页面名。它**不是**页面标题：真正的页面标题由
                内容区的 <h1> 承担（02 §A.2「页面标题唯一由内容区 h1 承担」）。
                早期版本把这里做成 28px 的 <h1>，结果每页出现两个 28px 标题
                叠在一起（"学生管理" + "学生与家庭账号"）—— 那不是层级，是重复。 */}
            <p className="app-breadcrumb">黄冠 AI Academy <span>/</span> {ROLE_LABEL[user.role]} <span>/</span> {pageTitle}</p>
          </div>
          <span className="role-chip">{user.name} · {ROLE_LABEL[user.role]}</span>
        </header>
        <main className="app-content">{children}</main>
        <footer className="app-footer">
          <span>每天进步一点，<b>就是很棒的进步。</b></span>
          <span>黄冠 AI Academy · {ROLE_LABEL[user.role]}</span>
        </footer>
      </div>

      {/* 移动底部 Tab Bar（<768px 可见，≥768px 由 CSS 隐藏） */}
      <nav className="app-tabbar" aria-label="主导航（精简）">
        {tabs.map((tab) =>
          tab.match === "__more__" ? (
            <button
              key="more"
              ref={moreButtonRef}
              type="button"
              className="app-tab"
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              onClick={openMore}
            >
              <span className="app-tab__icon">
                <Icon name={tab.icon} size={22} />
              </span>
              <span className="app-tab__label">{tab.label}</span>
            </button>
          ) : (
            <Link
              key={tab.match}
              href={tab.match}
              className={`app-tab${isActive(tab.match) ? " is-active" : ""}`}
              aria-current={isActive(tab.match) ? "page" : undefined}
            >
              <span className="app-tab__icon">
                <Icon name={tab.icon} size={22} />
              </span>
              <span className="app-tab__label">{tab.label}</span>
            </Link>
          ),
        )}
      </nav>

      {moreOpen && (
        <div className="app-more" data-open="true">
          <div className="app-more__scrim" onClick={closeMore} />
          <div
            className="app-more__panel"
            role="dialog"
            aria-modal="true"
            aria-label="全部功能"
            ref={moreRef}
          >
            <div className="app-more__head">
              <span className="app-more__title">全部功能</span>
              <button
                type="button"
                className="app-more__close"
                onClick={closeMore}
                aria-label="关闭"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <ul className="app-more__list">
              {moreItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="app-more__item"
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <span className="app-more__icon">
                      <Icon name={item.icon} size={20} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
