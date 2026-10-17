// 统一页面外壳，按角色显示导航并保留现有业务入口。
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";
import { ThemeToggle } from "./ThemeToggle";
import { Icon } from "./icons";
import { activeNavigation, navigationIcon } from "./academy-navigation";

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
    { href: "/practice", label: "错题模拟题" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 函数与圆锥曲线" },
    { href: "/bookings", label: "课程预约" },
    { href: "/reports", label: "学习总结" },
    { href: "/account", label: "账户设置" },
  ],
  TEACHER: [
    { href: "/", label: "老师工作台" },
    { href: "/teacher/review", label: "AI 错题复核" },
    { href: "/teacher/students", label: "我的学生" },
    { href: "/wrong-questions", label: "学生错题本" },
    { href: "/review", label: "智能复习" },
    { href: "/teacher/summaries", label: "学习总结审核" },
    { href: "/practice", label: "错题模拟题" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 函数与圆锥曲线" },
    { href: "/account", label: "账户设置" },
  ],
  ADMIN: [
    { href: "/", label: "管理首页" },
    { href: "/admin/students", label: "学生管理" },
    { href: "/admin/teachers", label: "老师管理" },
    { href: "/admin/slots", label: "课程时段" },
    { href: "/wrong-questions", label: "学生错题本" },
    { href: "/teacher/review", label: "错题审核" },
    { href: "/teacher/summaries", label: "学习总结审核" },
    { href: "/practice", label: "错题模拟题" },
    { href: "/geometry-lab", label: "动态几何实验室" },
    { href: "/geometry-editor", label: "自由几何编辑器" },
    { href: "/math-studio", label: "代数 CAS / 函数与圆锥曲线" },
    { href: "/account", label: "账户设置" },
  ],
} as const;

function Navigation({ user, pathname }: { user: SafeUser; pathname: string }) {
  const selected = activeNavigation(pathname, menus[user.role]);
  return (
    <>
      {menus[user.role].map((item) => {
        const active = selected === item.href;
        return (
          <Link key={item.href} href={item.href} className="academy-nav-link" aria-current={active ? "page" : undefined}>
            <Icon name={navigationIcon(item.href)} size={20} />
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
  const [workspaceScale,setWorkspaceScale]=useState(100);
  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      try{
        const saved=Number(window.localStorage.getItem("hg-academy-font-scale"));
        if([90,100,110,125,140].includes(saved))setWorkspaceScale(saved);
      }catch{/** private browsing */}
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[]);
  const changeScale=(next:number)=>{
    setWorkspaceScale(next);
    try{window.localStorage.setItem("hg-academy-font-scale",String(next));}catch{/** ephemeral */}
  };

  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { menuRef.current?.close(); }, [pathname]);

  // 原生对话框负责焦点限制、Escape 关闭和关闭后归还焦点。
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const unlock = () => { document.body.style.overflow = ""; };
    menu.addEventListener("close", unlock);
    return () => { menu.removeEventListener("close", unlock); unlock(); };
  }, [user, loading]);

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
    return <div className="academy-loading" role="status" aria-busy="true"><span className="sr-only">正在加载页面</span></div>;
  }
  if (!user || user.mustChangePassword) return null;

  const tabs = user.role === "FAMILY"
    ? [{ href: "/wrong-questions", label: "错题本" }, { href: "/practice", label: "练习" }, { href: "/", label: "首页" }, { href: "/review", label: "复习" }]
    : user.role === "TEACHER"
      ? [{ href: "/teacher/review", label: "复核" }, { href: "/teacher/students", label: "学生" }, { href: "/", label: "首页" }, { href: "/practice", label: "练习" }]
      : [{ href: "/admin/students", label: "学生" }, { href: "/admin/slots", label: "课程" }, { href: "/", label: "首页" }, { href: "/practice", label: "练习" }];
  const activeTab = activeNavigation(pathname, tabs);
  const currentPage = menus[user.role].find(item => item.href === activeNavigation(pathname, menus[user.role]))?.label ?? "学习空间";

  return (
    <div className="academy-shell">
      <aside className="academy-sidebar" aria-label="侧边导航">
        <Link href="/" className="academy-logo">
          <span className="academy-logo-mark">冠</span>
          <span><span className="academy-logo-title">黄冠 AI Academy</span><span className="academy-logo-subtitle">LEARN WITH CLARITY</span></span>
        </Link>
        <p className="academy-sidebar-caption">学习导航 / WORKSPACE</p>
        <nav className="academy-nav" aria-label="主导航"><Navigation user={user} pathname={pathname} /></nav>
        <div className="academy-sidebar-footer">
          <div className="academy-user-name">{user.name}</div>
          <div className="academy-user-role">{user.role === "FAMILY" ? "家庭账户" : user.role === "TEACHER" ? "教师账户" : "管理员"}</div>
          <button type="button" className="academy-signout" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "正在退出…" : "退出登录 →"}
          </button>
        </div>
      </aside>
      <div className="academy-content">
        <a className="academy-skip-link" href="#main-content">跳转到页面内容</a>
        <header className="academy-topbar">
          <div className="flex items-center gap-3">
            <span className="academy-logo-mark !h-9 !w-9 !rounded-xl !text-xl lg:hidden">冠</span>
            <span className="academy-topbar-label">黄冠 AI Academy <span className="academy-breadcrumb-divider">/</span> {currentPage}</span>
          </div>
          <div className="flex items-center gap-3">
            <div role="group" aria-label="内容字号和画布缩放" className="flex items-center gap-1" style={{border:"1px solid var(--line)",borderRadius:10,padding:3}}>
              <button type="button" aria-label="减小内容字号" title="内容缩小一级" disabled={workspaceScale===90}
               onClick={()=>changeScale(([90,100,110,125,140].filter(v=>v<workspaceScale).at(-1)??90))}
               style={{padding:"4px 7px",fontSize:13,fontWeight:800}}>A−</button>
              <span aria-live="polite" style={{fontSize:12,minWidth:37,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{workspaceScale}%</span>
              <button type="button" aria-label="增大内容字号" title="内容放大一级" disabled={workspaceScale===140}
               onClick={()=>changeScale(([90,100,110,125,140].find(v=>v>workspaceScale)??140))}
               style={{padding:"4px 7px",fontSize:16,fontWeight:800}}>A＋</button>
            </div>
            <ThemeToggle />
            <span className="academy-topbar-user">{user.name} · {user.role === "FAMILY" ? "家庭" : user.role === "TEACHER" ? "老师" : "管理员"}</span>
            <Link className="academy-account-link" href="/account" aria-label="账户设置"><Icon name="account" size={21} /></Link>
          </div>
        </header>
        <main key={pathname} className={`academy-workspace app-content${pathname === "/" ? " academy-home-workspace" : ""}`} id="main-content" tabIndex={-1} style={{zoom:workspaceScale/100}}>{children}</main>
        <footer className="academy-footer"><span>每天进步一点，都值得被看见。</span><span>黄冠 AI Academy</span></footer>
      </div>
      <nav className="academy-bottom-nav" aria-label="移动端主导航">
        {tabs.map(item => <Link key={item.href} href={item.href}
          className={`academy-bottom-item${item.href === "/" ? " academy-bottom-home" : ""}`}
          aria-current={activeTab === item.href ? "page" : undefined}>
          <span className="academy-bottom-icon"><Icon name={navigationIcon(item.href)} size={22} /></span>
          <span>{item.label}</span>
        </Link>)}
        <button type="button" className="academy-bottom-item" aria-label="全部功能" aria-haspopup="dialog"
          data-active={!activeTab || undefined} onClick={() => { menuRef.current?.showModal(); document.body.style.overflow = "hidden"; }}>
          <span className="academy-bottom-icon"><Icon name="filter" size={22} /></span><span>更多</span>
        </button>
      </nav>
      <dialog className="academy-menu" ref={menuRef} aria-labelledby="academy-menu-title"
        onClick={event => { if (event.target === event.currentTarget) menuRef.current?.close(); }}>
        <div className="academy-menu-content">
          <div className="academy-menu-heading"><div><span className="academy-eyebrow">YOUR WORKSPACE</span><h2 id="academy-menu-title">全部功能</h2></div>
            <button type="button" className="academy-close" aria-label="关闭全部功能" onClick={() => menuRef.current?.close()}><Icon name="close" size={22} /></button>
          </div>
          <nav aria-label="全部功能导航" onClick={event => { if ((event.target as HTMLElement).closest("a")) menuRef.current?.close(); }}><Navigation user={user} pathname={pathname} /></nav>
          <button type="button" className="academy-menu-signout" onClick={() => void signOut()} disabled={signingOut}><Icon name="logout" size={19} />{signingOut ? "正在退出…" : "退出登录"}</button>
        </div>
      </dialog>
    </div>
  );
}
