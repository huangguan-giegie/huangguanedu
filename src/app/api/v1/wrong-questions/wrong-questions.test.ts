import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { GET as listWrongQuestions, POST as uploadWrongQuestion } from "./route";
import { GET as exportWrongQuestions } from "./export/route";
import { GET as questionDetail } from "./[id]/route";
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

  it("英语长文六图上传：保留页序、模型和全部图片，原图保留约 90 天", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const png = await makePng();
    const form = new FormData();
    form.append("subject", "ENGLISH");
    form.append("model", "qwen-vl-max");
    for (let i = 0; i < 6; i++) form.append("image", new File([new Uint8Array(png)], `${i}.png`, { type: "image/png" }));
    const response = await uploadWrongQuestion(multipartRequest(sessionToken, csrfToken, form));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.imageIds).toHaveLength(6);
    const images = await prisma.rawQuestionImage.findMany({ where: { wrongQuestionId: body.data.wrongQuestionId }, orderBy: { createdAt: "asc" } });
    expect(images.map((image) => image.id)).toEqual(body.data.imageIds);
    expect(images[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 90 * 24 * 3600000);
    const job = await prisma.analysisJob.findUniqueOrThrow({ where: { id: body.data.jobId } });
    expect(job.modelOverride).toBe("qwen-vl-max");
  });

  it("英语最多六图，七图请求被拒绝", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const form = new FormData();
    form.append("subject", "ENGLISH");
    const png = await makePng();
    for (let i = 0; i < 7; i++) form.append("image", new File([new Uint8Array(png)], `${i}.png`, { type: "image/png" }));
    const response = await uploadWrongQuestion(multipartRequest(sessionToken, csrfToken, form));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_FILE_COUNT");
    expect(await prisma.wrongQuestion.count()).toBe(0);
  });

  it("非法模型不能进入识别任务", async () => {
    const { family } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    const form = new FormData();
    form.append("subject", "MATH");
    form.append("model", "invalid-model");
    const response = await uploadWrongQuestion(multipartRequest(sessionToken, csrfToken, form));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_MODEL");
  });

  it("本周已上传 100 道题后停止新上传", async () => {
    const { family, student } = await seedFamily();
    const { sessionToken, csrfToken } = await sessionFor(family.phone);
    await prisma.wrongQuestion.createMany({ data: Array.from({ length: 100 }, () => ({ studentId: student.id, subject: "MATH" as const })) });
    const form = new FormData();
    form.append("subject", "MATH");
    const response = await uploadWrongQuestion(multipartRequest(sessionToken, csrfToken, form));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("WEEKLY_QUOTA_EXCEEDED");
  });

  it("列表展示处理中、待确认和待审核，支持收藏知识点近期筛选与分页", async () => {
    const { family, student } = await seedFamily();
    const { sessionToken } = await sessionFor(family.phone);
    const questions = [];
    for (const status of ["PROCESSING", "PENDING_STUDENT_CONFIRMATION", "NEEDS_REVIEW"] as const) {
      questions.push(await prisma.wrongQuestion.create({ data: { studentId: student.id, subject: "MATH", status, recognizedQuestion: `函数 ${status}`, knowledgePointRecords: { create: { knowledgePoint: "二次函数" } } } }));
    }
    await prisma.wrongQuestionFavorite.create({ data: { wrongQuestionId: questions[1].id, userId: family.id } });
    const request = (query = "") => new NextRequest(`${baseUrl}/api/v1/wrong-questions${query}`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` } });
    const first = await listWrongQuestions(request("?page=1&pageSize=2"));
    const firstBody = await first.json();
    expect(firstBody.data.total).toBe(3);
    expect(firstBody.data.items).toHaveLength(2);
    const filtered = await listWrongQuestions(request(`?favorite=true&knowledgePoint=${encodeURIComponent("二次函数")}&from=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`));
    expect((await filtered.json()).data.items.map((item: { id: string }) => item.id)).toEqual([questions[1].id]);
    const invalid = await listWrongQuestions(request("?from=invalid-date"));
    expect(invalid.status).toBe(400);
  });

  it("导出与详情仅看本人错题，传入其他学生不会扩大家庭范围", async () => {
    const { family, student } = await seedFamily();
    const { sessionToken } = await sessionFor(family.phone);
    const question = await prisma.wrongQuestion.create({ data: { studentId: student.id, subject: "ENGLISH", status: "PUBLISHED", recognizedQuestion: "Choose the correct tense", finalAnswer: "B" } });
    const image = await prisma.rawQuestionImage.create({ data: { studentId: student.id, wrongQuestionId: question.id, filePath: "questions/preview.jpg", mimeType: "image/jpeg", sizeBytes: 10, expiresAt: new Date(Date.now() + 86400000) } });
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` };
    const detail = await questionDetail(new NextRequest(`${baseUrl}/api/v1/wrong-questions/${question.id}`, { headers }), { params: Promise.resolve({ id: question.id }) });
    expect((await detail.json()).data.wrongQuestion.imageUrls).toEqual([`/api/v1/images/${image.id}`]);
    const exported = await exportWrongQuestions(new NextRequest(`${baseUrl}/api/v1/wrong-questions/export?studentId=other-student&subject=ENGLISH`, { headers }));
    const body = await exported.json();
    expect(body.data.count).toBe(1);
    expect(body.data.content).toContain("Choose the correct tense");
    expect(body.data.content).toContain("最终答案");
  });
});
