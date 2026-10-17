import {NextResponse,type NextRequest} from "next/server";
import {Prisma} from "../../../../../../generated/prisma/client";
import {requireRole} from "../../../../../../lib/auth";
import {assertStateChangeAllowed} from "../../../../../../lib/csrf";
import {prisma} from "../../../../../../lib/db";
import {jsonError} from "../../../../../../lib/http";
import {allowedPracticeStudents} from "../../../../../../lib/practice-set";
import {validateDocument} from "../../../../../../lib/free-geometry";

type Context={params:Promise<{id:string}>};

/** A sketch is supplementary learning content, never an authoritative diagram
 * of the generated exam question. No question, answer or grading fields change.
 */
export async function PATCH(request:NextRequest,context:Context){
 const auth=await requireRole(request,prisma,["FAMILY","TEACHER","ADMIN"]);
 if("error" in auth)return auth.error;
 const csrf=assertStateChangeAllowed(request);if(csrf)return csrf;
 const {id}=await context.params;
 const students=await allowedPracticeStudents(prisma,auth.user);
 if(!students.length)return jsonError(403,"FORBIDDEN","无权查看相关学生练习题");
 const question=await prisma.practiceQuestion.findFirst({
  where:{id,practiceSet:{studentId:{in:students.map(s=>s.id)}}},
  select:{id:true},
 });
 if(!question)return jsonError(404,"PRACTICE_QUESTION_NOT_FOUND","练习题不存在或无权修改");
 const text=await request.text();
 if(text.length>160000)return jsonError(413,"SKETCH_TOO_LARGE","作图数据超过大小限制");
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{return jsonError(400,"INVALID_JSON","无效的JSON");}
 if(!parsed||typeof parsed!=="object"||!("geometrySketch" in parsed))
  return jsonError(400,"MISSING_SKETCH","缺少geometrySketch字段");
 let sketch:null|ReturnType<typeof validateDocument>=null;
 try{
  const value=(parsed as {geometrySketch:unknown}).geometrySketch;
  if(value!==null)sketch=validateDocument(value);
 }catch{return jsonError(400,"INVALID_SKETCH","作图数据不是有效的有向无环几何构造");}
 await prisma.practiceQuestion.update({
  where:{id},
  data:{geometrySketch:sketch===null?Prisma.DbNull:JSON.parse(JSON.stringify(sketch)) as Prisma.InputJsonValue},
 });
 return NextResponse.json({success:true,data:{id,geometrySketch:sketch}});
}
