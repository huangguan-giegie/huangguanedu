// 全站唯一的图标来源。
//
// 禁止在其他文件里内联 <svg>，也禁止用 Unicode 符号（✳ ✓ ✦ → ＋ ♙ …）当图标：
//  1. 跨系统渲染不可控 —— ✳(U+2733) 在苹方里是带八角星芒的粗符号，在 Segoe UI
//     Symbol 里是细线八角星，在 Linux 上可能是豆腐块。同一份代码三种形态。
//  2. 字重耦合 —— Unicode 符号走 font-weight，850 会让 ✦ 从四瓣变实心。
//  3. 基线错位 —— 符号基线与汉字基线不一致，必须逐个 vertical-align 硬调。
//  4. 不能统一控制线宽与颜色，无法换肤。
//
// 几何规范（02 §B.3，全站唯一一套）：
//   viewBox 0 0 24 24 · 视觉内容占 18×18 · stroke-width 1.5 · round 端点与拐角
//   fill:none · stroke:currentColor · 全部圆角矩形（rx ≥ 1.5）· 元素间距 ≥2px
//   视觉重心保持在 (12,12)
import type { ReactNode, SVGProps } from "react";

export type IconName =
  /* 导航 */
  | "home"
  | "wrong-question"
  | "practice"
  | "smart-review"
  | "booking"
  | "report"
  | "account"
  | "pending-review"
  | "students"
  | "student-management"
  | "teacher-management"
  | "slots"
  | "summary-review"
  /* 功能 */
  | "check"
  | "close"
  | "alert"
  | "info"
  | "clock"
  | "upload"
  | "download"
  | "search"
  | "filter"
  | "plus"
  | "arrow-right"
  | "chevron-right"
  | "star"
  | "star-filled"
  | "logout"
  | "edit"
  | "user-add"
  | "sparkle"
  | "sun"
  | "moon";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children"> {
  name: IconName;
  /** 尺寸（px）。默认 18 —— 与 globals.css 的 .app-nav-icon 对齐 */
  size?: number;
  /**
   * 无障碍标签。传入则 role="img" + aria-label（图标承载信息时用）；
   * 不传则 aria-hidden（纯装饰，默认）。
   */
  label?: string;
}

const PATHS: Record<IconName, ReactNode> = {
  /* ── 导航 ── */
  /* 1. 学习总览 —— 屋顶 + 门，表示"回到首页" */
  home: (
    <>
      <path d="M3.5 10.2 12 3.5l8.5 6.7" />
      <path d="M5.5 9.3V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.3" />
      <path d="M9.8 20.5v-4.7a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v4.7" />
    </>
  ),
  /* 2. 我的错题 —— 书签 + 折角，表示"标记待办" */
  "wrong-question": (
    <>
      <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5a.5.5 0 0 1-.78.42L12 16.6l-6.22 4.32a.5.5 0 0 1-.78-.42V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M9.5 7.5h5" />
      <path d="M9.5 11h3" />
    </>
  ),
  /* 3. 模拟练习 —— 铅笔 + 底线，表示"手写练习" */
  practice: (
    <>
      <path d="M16.4 3.9a2 2 0 0 1 2.83 0l.87.87a2 2 0 0 1 0 2.83L8.4 19.3l-4.2 1.1 1.1-4.2Z" />
      <path d="M14.6 5.7l3.7 3.7" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  /* 4. 智能复习 —— 循环箭头 + 中心点，表示"间隔重复" */
  "smart-review": (
    <>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
      <path d="M20.5 4.2v4.6h-4.6" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  /* 5. 预约课程 —— 日历 + 时针 */
  booking: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M12 12.5v3.2l2 1.3" />
    </>
  ),
  /* 6. 学习总结 —— 文档 + 折角 + 数据行 */
  report: (
    <>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z" />
      <path d="M13.5 3.5V8.5h5" />
      <path d="M9 12.5h6M9 16.5h4" />
    </>
  ),
  /* 7. 账户设置 —— 人形头肩 */
  account: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  /* 8. 待复核 —— 文档 + 对勾 */
  "pending-review": (
    <>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h4" />
      <path d="M13.5 3.5V8.5h5" />
      <path d="m13 14.5 2 2 4.5-4.8" />
    </>
  ),
  /* 9. 我的学生 —— 双人，头肩错位 */
  students: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20.2a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 5.9" />
      <path d="M17.6 14.4a5.6 5.6 0 0 1 3.6 5.8" />
    </>
  ),
  /* 10. 学生管理 —— 学士帽 */
  "student-management": (
    <>
      <path d="M2.8 8.6 12 4.2l9.2 4.4L12 13Z" />
      <path d="M6.6 10.6v4.2c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-4.2" />
      <path d="M20.4 9.2v5.4" />
    </>
  ),
  /* 11. 老师管理 —— 黑板 + 底线 */
  "teacher-management": (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M12 16.5v3M8.8 20.5h6.4" />
      <path d="M6.8 8h5M6.8 11.5h7.5" />
    </>
  ),
  /* 12. 课程时段 —— 日历 + 网格，表示"时段表" */
  slots: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M7.5 13h3M13.5 13h3M7.5 17h3M13.5 17h3" />
    </>
  ),
  /* 13. 学习总结审核 —— 文档 + 时钟，表示"待审" */
  "summary-review": (
    <>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h4" />
      <path d="M13.5 3.5V8.5h5" />
      <circle cx="16.5" cy="16" r="3.7" />
      <path d="M16.5 14.4v1.8l1.4.9" />
    </>
  ),

  /* ── 功能 ── */
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.5 8v5.5l-4 2v-7.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  "arrow-right": (
    <>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  "chevron-right": <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  star: <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9Z" />,
  "star-filled": (
    <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9Z" fill="currentColor" />
  ),
  logout: (
    <>
      <path d="M14.5 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h8.5" />
      <path d="M18.5 12H9" />
      <path d="m15 8.5 3.5 3.5-3.5 3.5" />
    </>
  ),
  edit: (
    <>
      <path d="M11 5.5H5.5a1.5 1.5 0 0 0-1.5 1.5v11.5A1.5 1.5 0 0 0 5.5 20.5H17a1.5 1.5 0 0 0 1.5-1.5V13" />
      <path d="M17.5 3.5a1.9 1.9 0 0 1 2.7 2.7L12.5 14l-3.5 1 1-3.5Z" />
    </>
  ),
  "user-add": (
    <>
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3 20.2a6.5 6.5 0 0 1 13 0" />
      <path d="M18.5 8v6M15.5 11h6" />
    </>
  ),
  /* AI 生成标记：四角星 + 小星，表示"机器产出" */
  sparkle: (
    <>
      <path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z" />
      <path d="M18.5 16.5 19.5 19l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
    </>
  ),
  /* 主题切换：太阳 / 月亮，描边风格与其他图标一致 */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
    </>
  ),
  moon: <path d="M20.2 14.2A8.6 8.6 0 0 1 9.8 3.8a8.6 8.6 0 1 0 10.4 10.4Z" />,
};

export function Icon({ name, size = 18, label, className, ...rest }: IconProps) {
  // 不传 label = 纯装饰，必须 aria-hidden + focusable="false"，
  // 否则读屏会把它当图片念出来，图标本身的形状对用户毫无信息量。
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true, focusable: "false" } as const);

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...a11y}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
