import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/db";
import { jsonError } from "../../../../../../lib/http";
import { allowedPracticeStudents } from "../../../../../../lib/practice-set";
import { getStorage } from "../../../../../../lib/storage";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, prisma, ["FAMILY", "TEACHER", "ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const students = await allowedPracticeStudents(prisma, auth.user);
  const question = await prisma.practiceQuestion.findFirst({ where: { id, practiceSet: { studentId: { in: students.map((s) => s.id) } } } });
  if (!question?.imagePath) return jsonError(404, "IMAGE_NOT_FOUND", "示意图不存在或无权访问");
  const url = await getStorage().getReadUrl(question.imagePath, 300);
  if (url) return NextResponse.redirect(url, 302);
  const root = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), "storage"));
  const path = resolve(/* turbopackIgnore: true */ root, question.imagePath);
  if (!path.startsWith(root + sep)) return jsonError(400, "INVALID_PATH", "非法图片路径");
  try { return new NextResponse(new Uint8Array(await readFile(path)), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } }); }
  catch { return jsonError(404, "IMAGE_NOT_FOUND", "示意图文件不存在"); }
}
