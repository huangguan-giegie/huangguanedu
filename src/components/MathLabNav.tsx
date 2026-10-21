import Link from "next/link";
import styles from "./MathLabNav.module.css";

export const MATH_LAB_SECTIONS = [
  { id: "exam", title: "真题题库", note: "按年份专题选题并加载", href: "/geometry-lab" },
  { id: "theorems", title: "几何定理", note: "拖动构造验证关系", href: "/geometry-lab?view=theorems" },
  { id: "editor", title: "自由作图", note: "建立自己的构型", href: "/geometry-lab?view=editor" },
  { id: "functions", title: "函数图像", note: "表达式与图像变换", href: "/math-studio?view=functions" },
  { id: "conics", title: "圆锥曲线", note: "自由研究曲线与直线", href: "/math-studio?view=conics" },
  { id: "cas", title: "符号计算", note: "精确代数与求解步骤", href: "/math-studio?view=cas" },
] as const;
export type MathLabSection = typeof MATH_LAB_SECTIONS[number]["id"];
export type GeometryWorkshop = "exam" | "theorems" | "editor";
export type MathStudioView = "functions" | "conics" | "cas";

export function MathLabNav({ current }: { current: MathLabSection }) {
  return <nav className={styles.root} aria-label="数学实验室统一导航">
    <div className={styles.heading}><strong>数学实验室</strong><span>从真题条件到图形、函数与计算</span></div>
    <div className={styles.links}>{MATH_LAB_SECTIONS.map(s => <Link key={s.id} href={s.href} aria-current={current === s.id ? "page" : undefined}>
      <strong>{s.title}</strong><small>{s.note}</small>
    </Link>)}</div>
  </nav>;
}
