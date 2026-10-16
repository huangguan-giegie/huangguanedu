import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { POST as login } from "../auth/login/route";
import { POST as favorite } from "./[id]/favorite/route";
import { GET as listWrongQuestions } from "./route";
import { GET as exportWrongQuestions } from "./export/route";

describe("错题收藏 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.wrongQuestionFavorite.deleteMany();
    await prisma.wrongQuestion.deleteMany();
    await prisma.teacherStudentAssignment.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.student.deleteMany();
    await prisma.familyAccount.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seed() {
    const family = await prisma.user.create({
      data: {
        phone: "13800000003",
        passwordHash: await hashPassword("Temp@123456"),
        role: "FAMILY",
        name: "演示家长",
        mustChangePassword: false,
      },
    });
    const familyAccount = await prisma.familyAccount.create({ data: { userId: family.id } });
    const student = await prisma.student.create({
      data: { familyAccountId: familyAccount.id, name: "演示学生", grade: "初二", school: "演示学校" },
    });
    const teacher = await prisma.user.create({
      data: {
        phone: "13800000002",
        passwordHash: await hashPassword("Temp@123456"),
        role: "TEACHER",
        name: "演示老师",
        mustChangePassword: false,
      },
    });
    const teacherProfile = await prisma.teacherProfile.create({ data: { userId: teacher.id } });
    await prisma.teacherStudentAssignment.create({ data: { teacherId: teacherProfile.id, studentId: student.id } });
    const admin = await prisma.user.create({
      data: {
        phone: "13800000001",
        passwordHash: await hashPassword("Temp@123456"),
        role: "ADMIN",
        name: "演示管理员",
        mustChangePassword: false,
      },
    });
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "PUBLISHED",
        recognizedQuestion: "函数题",
      },
    });
    return { family, teacher, admin, wrongQuestion };
  }

  async function sessionFor(phone: string) {
    const result = await login(
      new NextRequest(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password: "Temp@123456" }),
      }),
    );
    return {
      token: result.cookies.get(SESSION_COOKIE_NAME)!.value,
      csrf: result.cookies.get(CSRF_COOKIE_NAME)!.value,
    };
  }

  async function requestFor(id: string, phone: string, csrf: string, token: string, value: boolean) {
    return favorite(
      new NextRequest(`${baseUrl}/api/v1/wrong-questions/${id}/favorite`, {
        method: "POST",
        headers: {
          origin: baseUrl,
          cookie: `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          "x-test-user": phone,
        },
        body: JSON.stringify({ favorite: value }),
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("家庭、老师、管理员都可独立收藏，取消后互不影响", async () => {
    const { family, teacher, admin, wrongQuestion } = await seed();
    for (const user of [family, teacher, admin]) {
      const session = await sessionFor(user.phone);
      const add = await requestFor(wrongQuestion.id, user.phone, session.csrf, session.token, true);
      expect(add.status).toBe(200);
    }

    expect(await prisma.wrongQuestionFavorite.count({ where: { wrongQuestionId: wrongQuestion.id } })).toBe(3);
    const familySession = await sessionFor(family.phone);
    const remove = await requestFor(wrongQuestion.id, family.phone, familySession.csrf, familySession.token, false);
    expect(remove.status).toBe(200);
    expect(await prisma.wrongQuestionFavorite.count({ where: { wrongQuestionId: wrongQuestion.id } })).toBe(2);
  });

  it("其他家庭和未负责老师不能收藏该错题", async () => {
    const { wrongQuestion } = await seed();
    for (const [index, role] of (["FAMILY", "TEACHER"] as const).entries()) {
      const user = await prisma.user.create({ data: { phone: `1380000000${index + 6}`, passwordHash: await hashPassword("Temp@123456"), role, name: "无权限账户", mustChangePassword: false } });
      if (role === "FAMILY") await prisma.familyAccount.create({ data: { userId: user.id } });
      else await prisma.teacherProfile.create({ data: { userId: user.id } });
      const session = await sessionFor(user.phone);
      const response = await requestFor(wrongQuestion.id, user.phone, session.csrf, session.token, true);
      expect(response.status).toBe(403);
    }
    expect(await prisma.wrongQuestionFavorite.count()).toBe(0);
  });

  it("收藏请求必须携带有效 CSRF 令牌", async () => {
    const { family, wrongQuestion } = await seed();
    const session = await sessionFor(family.phone);
    const response = await requestFor(wrongQuestion.id, family.phone, "", session.token, true);
    expect(response.status).toBe(403);
    expect(await prisma.wrongQuestionFavorite.count()).toBe(0);
  });

  it("负责老师可查看与导出该学生错题；其他学生请求不能越权", async () => {
    const { teacher, wrongQuestion } = await seed();
    const session = await sessionFor(teacher.phone);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${session.token}` };
    const visible = await listWrongQuestions(new NextRequest(`${baseUrl}/api/v1/wrong-questions?studentId=${wrongQuestion.studentId}`, { headers }));
    expect(visible.status).toBe(200);
    expect((await visible.json()).data.items.map((item: { id: string }) => item.id)).toEqual([wrongQuestion.id]);
    const deniedList = await listWrongQuestions(new NextRequest(`${baseUrl}/api/v1/wrong-questions?studentId=other-student`, { headers }));
    expect(deniedList.status).toBe(403);
    const deniedExport = await exportWrongQuestions(new NextRequest(`${baseUrl}/api/v1/wrong-questions/export?studentId=other-student`, { headers }));
    expect(deniedExport.status).toBe(403);
  });
});
