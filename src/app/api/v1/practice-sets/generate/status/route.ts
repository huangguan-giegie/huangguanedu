import { after, NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";
import { allowedPracticeStudents, runPracticeGenerationJob } from "../../../../../../lib/practice-set";

export const maxDuration = 240;
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const students = await allowedPracticeStudents(prisma, auth.user);
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
  const jobs = await prisma.practiceGenerationJob.findMany({ where: { studentId: { in: students.map((s) => s.id) }, ...(jobId ? { id: jobId } : { requestedById: auth.user.id, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }) }, orderBy: { createdAt: "desc" }, take: jobId ? 1 : 10 });
  if (jobId && !jobs.length) return jsonError(404, "JOB_NOT_FOUND", "生成任务不存在或无权查看");
  for (const job of jobs) {
    if (job.status === "PENDING") after(() => runPracticeGenerationJob(prisma, job.id));
    if (job.status === "PROCESSING" && job.updatedAt.getTime() < Date.now() - 10 * 60 * 1000) {
      await prisma.practiceGenerationJob.updateMany({ where: { id: job.id, status: "PROCESSING", updatedAt: job.updatedAt }, data: { status: "FAILED", error: "生成任务被中断或超时，请重新生成" } });
      job.status = "FAILED"; job.error = "生成任务被中断或超时，请重新生成";
    }
  }
  const items = jobs.map((job) => ({ jobId: job.id, studentId: job.studentId, status: job.status, error: job.error, practiceSetId: job.resultPracticeSetId, createdAt: job.createdAt }));
  return NextResponse.json({ success: true, data: jobId ? items[0] : { items } });
}
