import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "../../../../../../../lib/auth";
import {prisma} from "../../../../../../../lib/db";
import {jsonError} from "../../../../../../../lib/http";
import {allowedPracticeStudents} from "../../../../../../../lib/practice-set";
import {matchingLegacyDiameterProblem} from "../../../../../../../lib/legacy-circle-repair";
import type {Prisma} from "../../../../../../../generated/prisma/client";

/** Explicit teacher/admin action only: never silently change an old answer
 * while a student is submitting the existing question. */
export async function POST(request:NextRequest,ctx:{params:Promise<{id:string;questionId:string}>}){
 const auth=await requireRole(request,prisma,["TEACHER","ADMIN"]);
 if("error" in auth)return auth.error;
 const {id,questionId}=await ctx.params;
 const students=await allowedPracticeStudents(prisma,auth.user);
 const question=await prisma.practiceQuestion.findFirst({
  where:{id:questionId,practiceSetId:id,practiceSet:{studentId:{in:students.map(s=>s.id)}}},
  select:{id:true,question:true,imagePath:true},
 });
 if(!question)return jsonError(404,"NOT_FOUND","没有权限修改此题");
 const verified=matchingLegacyDiameterProblem(question.question);
 if(!verified)return jsonError(422,"NO_SAFE_REPAIR","该题不匹配已知且可验证的圆周角构型，不自动修改");
 await prisma.practiceQuestion.update({
  where:{id:question.id},
  data:{question:verified.question,answer:verified.answer,explanation:verified.explanation,
   diagram:verified.diagram as Prisma.InputJsonValue,imagePath:null},
 });
 return NextResponse.json({success:true,data:{questionId:question.id,answer:verified.answer}});
}
