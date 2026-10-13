import type { Metadata } from "next";
import "./globals.css";
/* 08T 皮肤（纸上流光 · 科技增强）—— 删掉下面这一行即可全站回退到原品牌紫 */
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
