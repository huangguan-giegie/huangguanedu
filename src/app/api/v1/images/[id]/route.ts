// GET /api/v1/images/:id：返回临时错题原图（仅本人家庭/负责老师/管理员，且未删除）
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { requireUser } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";
import { getStorageReadUrl } from "../../../../../lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

const storageRoot = process.env.STORAGE_DIR ?? join(process.cwd(), "storage");

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireUser(request, prisma);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const image = await prisma.rawQuestionImage.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          teacherAssignments: { include: { teacher: { include: { user: true } } } },
          familyAccount: true,
        },
      },
      wrongQuestion: true,
    },
  });
  if (!image || image.deletedAt) {
    return jsonError(404, "IMAGE_NOT_FOUND", "图片不存在或已删除");
  }

  // 权限：家庭看自己的学生；老师看负责的学生；管理员可看全部
  if (auth.user.role === "FAMILY") {
    if (image.student.familyAccount.userId !== auth.user.id) {
      return jsonError(403, "FORBIDDEN", "无权访问该图片");
    }
  } else if (auth.user.role === "TEACHER") {
    const isAssigned = image.student.teacherAssignments.some(
      (a) => a.endsAt === null && a.teacher.user.id === auth.user.id,
    );
    if (!isAssigned) {
      return jsonError(403, "FORBIDDEN", "无权访问该图片");
    }
  }

  // 生产 OSS：返回短期签名 URL 重定向；本地存储走文件流
  const readUrl = await getStorageReadUrl(image.filePath, 300);
  if (readUrl) {
    return NextResponse.redirect(readUrl, 302);
  }

  try {
    const buffer = await readFile(join(storageRoot, image.filePath));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return jsonError(404, "IMAGE_FILE_NOT_FOUND", "图片文件不存在");
  }
}
