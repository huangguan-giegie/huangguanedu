import type { Metadata } from "next";
import { AuthGuard } from "../../components/AuthGuard";
import { FreeGeometryEditor } from "../../components/FreeGeometryEditor";

export const metadata: Metadata = {
  title: "自由几何编辑器 | 黄冠AI Academy",
  description: "创建点、直线、线段、圆和依赖交点，可拖动父对象、撤销重做、导入导出。",
};
export default function FreeGeometryPage(){
 return <AuthGuard><FreeGeometryEditor/></AuthGuard>;
}
