import { NextResponse,type NextRequest } from "next/server";
import type {Prisma} from "../../../../../../../generated/prisma/client";
import {requireRole} from "../../../../../../../lib/auth";
import {prisma} from "../../../../../../../lib/db";
import {jsonError} from "../../../../../../../lib/http";
import {allowedPracticeStudents} from "../../../../../../../lib/practice-set";
import {packPracticeDrawing} from "../../../../../../../lib/practice-drawing";
import {validateDocument} from "../../../../../../../lib/free-geometry";

/** Teacher-reviewed reusable construction. This does not change the question,
 * answer, grading mode or source images. Students can preview locally only. */
export async function POST(request:NextRequest,ctx:{params:Promise<{id:string;questionId:string}>}){
 const auth=await requireRole(request,prisma,["TEACHER","ADMIN"]);
 if("error" in auth)return auth.error;
 const {id,questionId}=await ctx.params;
 const students=await allowedPracticeStudents(prisma,auth.user);
 const set=await prisma.practiceSet.findFirst({
  where:{id,studentId:{in:students.map(s=>s.id)}},
  select:{id:true},
 });
 if(!set)return jsonError(404,"PRACTICE_SET_NOT_FOUND","该题不存在或无权修改");
 const target=await prisma.practiceQuestion.findFirst({where:{id:questionId,practiceSetId:set.id},select:{id:true,diagram:true}});
 if(!target)return jsonError(404,"PRACTICE_QUESTION_NOT_FOUND","该题不存在");
 let parsed:unknown;
 try{
  const text=await request.text();
  if(text.length>160000)return jsonError(413,"FIGURE_TOO_LARGE","图形超过大小上限");
  parsed=JSON.parse(text);
 }catch{return jsonError(400,"BAD_FIGURE","上传数据必须是 JSON");}
 const payload=parsed as {drawing?:unknown;confirmed?:unknown}|null;
 if(!payload||payload.confirmed!==true)return jsonError(400,"REVIEW_REQUIRED","老师需要确认题目条件与图形一致");
 let document;
 try{document=validateDocument(payload.drawing);}
 catch{return jsonError(400,"INVALID_FIGURE","几何图形存在不合法的约束或坐标");}
 if(!document.objects.some(o=>o.kind==="line"||o.kind==="segment"||o.kind==="circle"||o.kind==="polygon"))
  return jsonError(400,"EMPTY_FIGURE","请选择包含实际线段、直线、圆或多边形的作图");
 const stored=packPracticeDrawing(target.diagram,document);
 await prisma.practiceQuestion.update({where:{id:target.id},data:{diagram:stored as Prisma.InputJsonValue}});
 return NextResponse.json({success:true,data:{questionId:target.id,attached:true}});
}
