import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { POST as uploadWrongQuestion } from "./route";
import { POST as login } from "../auth/login/route";

describe("错题上传 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.analysisJob.deleteMany();
    await prisma.rawQuestionImage.deleteMany();
    await prisma.wrongQuestion.deleteMany();
    await prisma.student.deleteMany();
    await prisma.familyAccount.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedFamily() {
    const family = await prisma.user.create({
      data: {
        phone: "13800000003",
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "演示家长",
        mustChangePassword: false,
      },
    });
    const account = await prisma.familyAccount.create({
      data: { userId: family.id },
    });
    const student = await prisma.student.create({
      data: {
        familyAccountId: account.id,
        name: "演示学生 A",
        grade: "初二",
        school: "演示中学",
      },
    });
    return { family, student };
  }

  async function doLogin(phone: string) {
    return login(
      new NextRequest(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password: "Temp@123456" }),
      }),
    );
  }

  async function sessionFor(phone: string) {
    const res = await doLogin(phone);
    return {
      sessionToken: res.cookies.get(SESSION_COOKIE_NAME)!.value,
      csrfToken: res.cookies.get(CSRF_COOKIE_NAME)!.value,
    };
  }

  async function makePng(size = 2048): Promise<Buffer> {
    return sharp({
      create: {
        width: Math.min(size, 64),
        height: Math.min(size, 64),
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();
  }

  function multipartRequest(
    sessionToken: string,
    csrfToken: string,
    form: FormData,
  ): NextRequest {
    return new NextRequest(`${baseUrl}/api/v1/wrong-questions`, {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.7",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "x-csrf-token": csrfToken,
        origin: baseUrl,
      },
      body: form,
    });
  }

  it("上传单张合法图片：创建 WrongQuestion/AnalysisJob/RawQuestionImage 并返回 PROCESSING", async () => {
    const { family, student } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("image", new File([new Uint8Array(png)], "question.png", { type: "image/png" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("PROCESSING");

    const wrongQuestion = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: body.data.wrongQuestionId },
    });
    expect(wrongQuestion.studentId).toBe(student.id);
    expect(wrongQuestion.subject).toBe("MATH");
    expect(wrongQuestion.status).toBe("PROCESSING");

    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.reviewStatus).toBe("NORMAL");
    expect(image.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(image.mimeType).toBe("image/jpeg");

    const job = await prisma.analysisJob.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(job.status).toBe("PENDING");
  });

  it("缺少 CSRF 令牌的上传被拒绝（403）", async () => {
    const { family } = await seedFamily();
    const { sessionToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "MATH");
    form.append(
      "image",
      new File([new Uint8Array(png)], "a.png", { type: "image/png" }),
    );

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, "", form),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("CSRF_TOKEN_MISMATCH");
  });

  it("多文件上传被拒", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("image", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));
    form.append("image", new File([new Uint8Array(png)], "b.png", { type: "image/png" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE_COUNT");
  });

  it("错误 MIME 被拒", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("image", new File([new Uint8Array(png)], "a.txt", { type: "text/plain" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("超大文件被拒（>8MB）", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const big = Buffer.alloc(9 * 1024 * 1024, 1);
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("image", new File([new Uint8Array(big)], "big.png", { type: "image/png" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("缺少或非法学科被拒", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "PHYSICS");
    form.append("image", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_SUBJECT");
  });

  it("非家庭角色上传被拒", async () => {
    const admin = await prisma.user.create({
      data: {
        phone: "13800000001",
        passwordHash: await hashPassword("Temp@123456"),
        role: "ADMIN",
        name: "管理员",
        mustChangePassword: false,
      },
    });
    const { sessionToken, csrfToken } = await sessionFor(admin.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("image", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));

    const res = await uploadWrongQuestion(
      multipartRequest(sessionToken, csrfToken, form),
    );
    expect(res.status).toBe(403);
  });
});
