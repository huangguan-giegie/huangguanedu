import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { POST as feedback } from "./[id]/feedback/route";
import { GET as teacherQueue } from "../teacher/wrong-questions/route";
import { GET as teacherStudents } from "../teacher/students/route";
import { PATCH as review } from "../teacher/wrong-questions/[id]/review/route";
import { POST as merge } from "../teacher/wrong-questions/[id]/merge/route";
import { POST as login } from "../auth/login/route";

describe("学生反馈与老师审核 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.analysisJob.deleteMany();
    await prisma.wrongQuestionKnowledgePoint.deleteMany();
    await prisma.studentAnswerAttempt.deleteMany();
    await prisma.wrongQuestionOccurrence.deleteMany();
    await prisma.rawQuestionImage.deleteMany();
    await prisma.wrongQuestion.deleteMany();
    await prisma.teacherStudentAssignment.deleteMany();
    await prisma.student.deleteMany();
    await prisma.familyAccount.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(data: {
    phone: string;
    role: "ADMIN" | "TEACHER" | "FAMILY";
    name: string;
  }) {
    return prisma.user.create({
      data: {
        phone: data.phone,
        passwordHash: await hashPassword("Temp@123456"),
        role: data.role,
        name: data.name,
        mustChangePassword: false,
      },
    });
  }

  async function seedDemo() {
    const admin = await createUser({
      phone: "13800000001",
      role: "ADMIN",
      name: "管理员",
    });
    const teacher = await createUser({
      phone: "13800000002",
      role: "TEACHER",
      name: "黄冠",
    });
    const family = await createUser({
      phone: "13800000003",
      role: "FAMILY",
      name: "演示家长",
    });
    const teacherProfile = await prisma.teacherProfile.create({
      data: { userId: teacher.id },
    });
    const familyAccount = await prisma.familyAccount.create({
      data: { userId: family.id },
    });
    const student = await prisma.student.create({
      data: {
        familyAccountId: familyAccount.id,
        name: "演示学生 A",
        grade: "初二",
        school: "演示中学",
      },
    });
    await prisma.teacherStudentAssignment.create({
      data: { teacherId: teacherProfile.id, studentId: student.id },
    });
    return { admin, teacher, family, teacherProfile, student };
  }

  async function createPendingQuestion(studentId: string, withImage = true) {
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId,
        subject: "MATH",
        status: "PENDING_STUDENT_CONFIRMATION",
        isAiGenerated: true,
        recognizedQuestion: "解方程 2x+3=11",
        finalAnswer: "x=4",
      },
    });
    if (withImage) {
      await prisma.rawQuestionImage.create({
        data: {
          studentId,
          wrongQuestionId: wrongQuestion.id,
          filePath: "questions/test.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 10,
          expiresAt: new Date(Date.now() + 24 * 3600000),
        },
      });
    }
    return wrongQuestion;
  }

  function jsonRequest(
    url: string,
    method: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest(`${baseUrl}${url}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function sessionFor(phone: string) {
    const res = await login(
      jsonRequest("/api/v1/auth/login", "POST", {
        phone,
        password: "Temp@123456",
      }),
    );
    return {
      sessionToken: res.cookies.get(SESSION_COOKIE_NAME)!.value,
      csrfToken: res.cookies.get(CSRF_COOKIE_NAME)!.value,
    };
  }

  function authedRequest(
    url: string,
    method: string,
    sessionToken: string,
    csrfToken: string,
    body?: unknown,
  ): NextRequest {
    return jsonRequest(url, method, body, {
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
      "x-csrf-token": csrfToken,
      origin: baseUrl,
    });
  }

  it("学生 ACCURATE：直接发布完整解答，无需老师审核，保留 AI 初步生成标记", async () => {
    const { family, student } = await seedDemo();
    const wrongQuestion = await createPendingQuestion(student.id);
    const fam = await sessionFor(family.phone);

    const res = await feedback(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/feedback`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { feedback: "ACCURATE" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("PUBLISHED");
    expect(updated.studentConfirmedAt).not.toBeNull();
    expect(updated.feedbackValue).toBe("ACCURATE");
    // AI 初步生成标记保留，不标注老师已审核
    expect(updated.isAiGenerated).toBe(true);
    expect(updated.isTeacherReviewed).toBe(false);

    // 待复核队列不包含该题
    const teacher = await sessionFor("13800000002");
    const queue = await teacherQueue(
      authedRequest(
        "/api/v1/teacher/wrong-questions",
        "GET",
        teacher.sessionToken,
        teacher.csrfToken,
      ),
    );
    const queueBody = await queue.json();
    expect(queueBody.data.items).toHaveLength(0);
  });

  it("学生 NEEDS_REVIEW：进入老师复核队列，原图延长保留 7 天", async () => {
    const { family, student, teacher } = await seedDemo();
    const wrongQuestion = await createPendingQuestion(student.id);
    const fam = await sessionFor(family.phone);

    const res = await feedback(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/feedback`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { feedback: "NEEDS_REVIEW" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("NEEDS_REVIEW");
    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.reviewStatus).toBe("AWAITING_REVIEW");
    expect(image.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 3600000,
    );

    const teacherSession = await sessionFor(teacher.phone);
    const queue = await teacherQueue(
      authedRequest(
        "/api/v1/teacher/wrong-questions",
        "GET",
        teacherSession.sessionToken,
        teacherSession.csrfToken,
      ),
    );
    const queueBody = await queue.json();
    expect(queueBody.data.items).toHaveLength(1);
    expect(queueBody.data.items[0].id).toBe(wrongQuestion.id);
  });

  it("老师审核：覆盖字段、标记老师已审核、删除原图、写审计", async () => {
    const { family, student, teacher } = await seedDemo();
    const wrongQuestion = await createPendingQuestion(student.id);
    const fam = await sessionFor(family.phone);
    await feedback(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/feedback`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { feedback: "NEEDS_REVIEW" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );

    const teacherSession = await sessionFor(teacher.phone);
    const res = await review(
      authedRequest(
        `/api/v1/teacher/wrong-questions/${wrongQuestion.id}/review`,
        "PATCH",
        teacherSession.sessionToken,
        teacherSession.csrfToken,
        {
          finalAnswer: "x=4（老师确认）",
          teacherNote: "步骤正确",
          mastered: false,
        },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.status).toBe("REVIEWED");
    expect(updated.isTeacherReviewed).toBe(true);
    expect(updated.finalAnswer).toBe("x=4（老师确认）");
    expect(updated.mastered).toBe(false);

    const image = await prisma.rawQuestionImage.findFirstOrThrow({
      where: { wrongQuestionId: wrongQuestion.id },
    });
    expect(image.deletedAt).not.toBeNull();
    expect(image.reviewStatus).toBe("REVIEWED");

    const audit = await prisma.auditLog.count({
      where: { action: "TEACHER_REVIEW" },
    });
    expect(audit).toBe(1);
  });

  it("非负责老师审核被拒（403）", async () => {
    const { family, student } = await seedDemo();
    // 另一个老师（不负责该学生）
    const otherTeacher = await createUser({
      phone: "13800000005",
      role: "TEACHER",
      name: "李老师",
    });
    await prisma.teacherProfile.create({ data: { userId: otherTeacher.id } });
    const wrongQuestion = await createPendingQuestion(student.id);
    const fam = await sessionFor(family.phone);
    await feedback(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/feedback`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { feedback: "NEEDS_REVIEW" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );

    const other = await sessionFor(otherTeacher.phone);
    const res = await review(
      authedRequest(
        `/api/v1/teacher/wrong-questions/${wrongQuestion.id}/review`,
        "PATCH",
        other.sessionToken,
        other.csrfToken,
        { finalAnswer: "x" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("合并重复错题：记录迁移到目标，源题软删除", async () => {
    const { student, teacher } = await seedDemo();
    const source = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "REVIEWED",
        recognizedQuestion: "重复题 A",
      },
    });
    const target = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "REVIEWED",
        recognizedQuestion: "目标题 B",
      },
    });
    await prisma.wrongQuestionOccurrence.create({
      data: { wrongQuestionId: source.id },
    });

    const teacherSession = await sessionFor(teacher.phone);
    const res = await merge(
      authedRequest(
        `/api/v1/teacher/wrong-questions/${source.id}/merge`,
        "POST",
        teacherSession.sessionToken,
        teacherSession.csrfToken,
        { targetId: target.id },
      ),
      { params: Promise.resolve({ id: source.id }) },
    );
    expect(res.status).toBe(200);

    const occurrences = await prisma.wrongQuestionOccurrence.findMany({
      where: { wrongQuestionId: target.id },
    });
    expect(occurrences).toHaveLength(1);
    const sourceAfter = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(sourceAfter.deletedAt).not.toBeNull();
  });

  it("非负责老师合并错题被拒绝（403）", async () => {
    const { student } = await seedDemo();
    const otherTeacher = await createUser({
      phone: "13800000005",
      role: "TEACHER",
      name: "李老师",
    });
    await prisma.teacherProfile.create({ data: { userId: otherTeacher.id } });
    const source = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "REVIEWED",
        recognizedQuestion: "重复题 A",
      },
    });
    const target = await prisma.wrongQuestion.create({
      data: {
        studentId: student.id,
        subject: "MATH",
        status: "REVIEWED",
        recognizedQuestion: "目标题 B",
      },
    });

    const other = await sessionFor(otherTeacher.phone);
    const res = await merge(
      authedRequest(
        `/api/v1/teacher/wrong-questions/${source.id}/merge`,
        "POST",
        other.sessionToken,
        other.csrfToken,
        { targetId: target.id },
      ),
      { params: Promise.resolve({ id: source.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("管理员可查看老师学生列表（老师学生接口）", async () => {
    const { admin, student } = await seedDemo();
    const adminSession = await sessionFor(admin.phone);

    const res = await teacherStudents(
      authedRequest(
        "/api/v1/teacher/students",
        "GET",
        adminSession.sessionToken,
        adminSession.csrfToken,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.students.map((s: { student: { id: string } }) => s.student.id)).toContain(
      student.id,
    );
  });
});
