import type { IconName } from "./icons";

const icons: Record<string, IconName> = {
  "/": "home",
  "/wrong-questions/new": "upload",
  "/wrong-questions": "wrong-question",
  "/review": "smart-review",
  "/practice": "practice",
  "/geometry-lab": "sparkle",
  "/geometry-editor": "edit",
  "/practice-sets": "practice",
  "/bookings": "booking",
  "/reports": "report",
  "/account": "account",
  "/teacher/review": "pending-review",
  "/teacher/students": "students",
  "/teacher/summaries": "summary-review",
  "/admin/students": "student-management",
  "/admin/teachers": "teacher-management",
  "/admin/slots": "slots",
};

export function navigationIcon(href: string): IconName {
  return icons[href] ?? "arrow-right";
}

// 优先匹配更具体的入口，上传错题时不同时选中错题本。
export function activeNavigation(pathname: string, items: readonly { href: string }[]): string | undefined {
  return [...items].sort((a, b) => b.href.length - a.href.length)
    .find(({ href }) => pathname === href || (href !== "/" && pathname.startsWith(href + "/")))?.href;
}
