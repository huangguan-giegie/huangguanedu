import type { Metadata } from "next";
import { AuthGuard } from "../../components/AuthGuard";
import { GeometryLab } from "../../components/GeometryLab";

export const metadata: Metadata = {
  title: "动态几何实验室 | 黄冠AI Academy",
  description: "通过拖动控制点实时探索角平分线、相似三角形与两圆公切线的几何关系。",
};

export default function GeometryLabPage() {
  return <AuthGuard><GeometryLab /></AuthGuard>;
}
