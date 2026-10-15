import type { Metadata } from "next";
import "./globals.css";
/* 08T 主题层（token → 质感 → Tailwind 覆盖器）—— 删掉下面这一行即可全站回退 */
import "./theme-08t.css";

// 原先这里用 next/font/google 拉 Geist / Geist_Mono。生产服务器拉不到 Google Fonts，
// 离线构建会以 NextFontError 直接失败（本地有缓存所以看不出来，构建一换机器就暴露）。
// 站点正文是中文，Geist 只影响少量西文与数字，改用系统字体栈：
// 变量名保持不变，globals.css / theme-08t.css 里的 var(--font-geist-*) 引用照旧生效。
const geistSans = { variable: "--font-geist-sans" };
const geistMono = { variable: "--font-geist-mono" };

export const metadata: Metadata = {
  title: "黄冠AI Academy",
  description: "黄冠AI Academy 错题智能分析与课程预约平台",
};

/**
 * 首屏防闪烁（01 §9.2）。
 *
 * 这段脚本必须**阻塞式**执行在 <head> 里、React 水合之前。深色是产品默认身份，
 * 如果等 React 挂载完再设 data-theme，深色用户会先看到一帧浅色 —— 那就是"白闪"，
 * 是本次改造要消灭的核心症状之一。
 *
 * 决策：以用户显式选择为准；未选择过时跟随系统。理由是若强制"无论系统如何首次都
 * 深色"，浅色系统用户会觉得"这网站是不是坏了"。
 *
 * ⚠️ storage key 必须与 ThemeToggle.tsx 里的 STORAGE_KEY 保持一致。
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('hg-theme');
if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // 禁用 JS 时固定深色（主题层 :root 就是深色值），这是刻意的简化：
      // 把浅色值在 CSS 里写第三遍的维护成本远大于收益。
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
