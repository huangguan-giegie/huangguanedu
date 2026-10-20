import type { Metadata } from "next";
import { AuthGuard } from "../../components/AuthGuard";
import { GeometryLab } from "../../components/GeometryLab";

export const metadata: Metadata = {
  title: "数学实验室 · 真题与几何 | 黄冠AI Academy",
  description: "结合武汉中考和湖北高考真题，逐问研究动点约束、相似、函数与圆锥曲线，并使用统一数学工具继续探索。",
};

export default async function GeometryLabPage({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  const {view}=await searchParams;
  const workshop=view==="theorems"||view==="editor"?view:"exam";
  return <AuthGuard><GeometryLab workshop={workshop}/></AuthGuard>;
}
