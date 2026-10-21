import type {Metadata} from "next";
import {AuthGuard} from "../../components/AuthGuard";
import {MathStudio} from "../../components/MathStudio";
export const metadata:Metadata={title:"数学实验室 · 函数与代数 | 黄冠 AI Academy",description:"统一函数图像、圆锥曲线与精确符号计算，支持从真题探究带入表达式。"};
export default async function MathStudioPage({searchParams}:{searchParams:Promise<{view?:string|string[];expression?:string|string[];preset?:string|string[]}>}){
 const query=await searchParams;
 const view=query.view==="cas"?"cas":query.view==="conics"||query.view==="conic"?"conics":"functions";
 const expression=typeof query.expression==="string"?query.expression.slice(0,160):undefined;
 const preset=query.preset==="hubei2022"||query.preset==="hubei2025"?query.preset:undefined;
 return <AuthGuard><MathStudio key={`${view}-${expression??""}-${preset??""}`} view={view} initialExpression={expression} conicPreset={preset}/></AuthGuard>;
}
