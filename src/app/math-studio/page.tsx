import type {Metadata} from "next";
import {AuthGuard} from "../../components/AuthGuard";
import {MathStudio} from "../../components/MathStudio";
export const metadata:Metadata={title:"数学工作室 CAS + 3D | 黄冠 AI Academy",description:"精确多项式符号代数与三维函数作图"};
export default function MathStudioPage(){return <AuthGuard><MathStudio/></AuthGuard>}
