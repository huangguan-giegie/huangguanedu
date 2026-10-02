import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { GET as listWrongQuestions } from "../wrong-questions/route";
import { GET as getWrongQuestion } from "../wrong-questions/[id]/route";
import { PATCH as setStatus } from "../wrong-questions/[id]/status/route";
import { POST as addAttempt } from "../wrong-questions/[id]/attempts/route";
import { GET as listReports } from "./route";
import { POST as generateReport } from "./generate/route";
import { PATCH as reviewReport } from "./[id]/review/route";
import { POST as publishReport } from "./[id]/publish/route";
import { GET as listSummaries } from "../summaries/route";
import { POST as generateSummary } from "../summaries/generate/route";
import { PATCH as reviewSummary } from "../summaries/[id]/review/route";
import { POST as publishSummary } from "../summaries/[id]/publish/route";
import { GET as listPracticeSets } from "../practice-sets/route";
import { POST as generatePracticeSet } from "../practice-sets/generate/route";
import { GET as listTerms } from "../admin/academic-terms/route";
import { POST as createTerm } from "../admin/academic-terms/route";
import { PATCH as updateTerm } from "../admin/academic-terms/[id]/route";
import { POST as login } from "../auth/login/route";
import { monthPeriodFromString, weekPeriod } from "../../../../lib/summary";

describe("学习总结与月报兼容 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.analysisJob.deleteMany();
    await prisma.practiceQuestion.deleteMany();
    await prisma.practiceSet.deleteMany();
    await prisma.academicTerm.deleteMany();
    await prisma.learningSummary.deleteMany();
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

  async function createPublishedQuestion(
    studentId: string,
    subject: "MATH" | "ENGLISH" = "MATH",
    points: string[] = ["一元一次方程"],
  ) {
    const wrongQuestion = await prisma.wrongQuestion.create({
      data: {
        studentId,
        subject,
        status: "PUBLISHED",
        isAiGenerated: true,
        recognizedQuestion: `题目：${subject}`,
        finalAnswer: "x=4",
        correctSteps: ["2x=8", "x=4"],
        thinkingHint: "移项",
        errorCauses: ["移项错误"],
        aiConfidence: 0.9,
        difficulty: "EASY",
        createdAt: new Date("2026-06-15T00:00:00Z"),
      },
    });
    for (const point of points) {
      await prisma.wrongQuestionKnowledgePoint.create({
        data: { wrongQuestionId: wrongQuestion.id, knowledgePoint: point },
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

  it("错题列表按学科/知识点/mastered 筛选", async () => {
    const { family, student } = await seedDemo();
    const math = await createPublishedQuestion(student.id, "MATH", ["一元一次方程"]);
    await createPublishedQuestion(student.id, "ENGLISH", ["阅读理解"]);
    await prisma.wrongQuestion.update({
      where: { id: math.id },
      data: { mastered: true },
    });
    const fam = await sessionFor(family.phone);

    const all = await listWrongQuestions(
      authedRequest("/api/v1/wrong-questions", "GET", fam.sessionToken, fam.csrfToken),
    );
    expect((await all.json()).data.total).toBe(2);

    const mathOnly = await listWrongQuestions(
      authedRequest(
        "/api/v1/wrong-questions?subject=MATH",
        "GET",
        fam.sessionToken,
        fam.csrfToken,
      ),
    );
    const mathBody = await mathOnly.json();
    expect(mathBody.data.total).toBe(1);
    expect(mathBody.data.items[0].id).toBe(math.id);

    const byPoint = await listWrongQuestions(
      authedRequest(
        "/api/v1/wrong-questions?knowledgePoint=阅读理解",
        "GET",
        fam.sessionToken,
        fam.csrfToken,
      ),
    );
    expect((await byPoint.json()).data.total).toBe(1);
  });

  it("错题详情返回三层展示字段", async () => {
    const { family, student } = await seedDemo();
    const wrongQuestion = await createPublishedQuestion(student.id);
    const fam = await sessionFor(family.phone);

    const res = await getWrongQuestion(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}`,
        "GET",
        fam.sessionToken,
        fam.csrfToken,
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.wrongQuestion.thinkingHint).toBe("移项");
    expect(body.data.wrongQuestion.errorCauses).toEqual(["移项错误"]);
    expect(body.data.wrongQuestion.correctSteps).toEqual(["2x=8", "x=4"]);
  });

  it("标记已理解/仍不会", async () => {
    const { family, student } = await seedDemo();
    const wrongQuestion = await createPublishedQuestion(student.id);
    const fam = await sessionFor(family.phone);

    const res = await setStatus(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/status`,
        "PATCH",
        fam.sessionToken,
        fam.csrfToken,
        { mastered: true },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(res.status).toBe(200);
    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.mastered).toBe(true);
  });

  it("再次作答：答错产生再出错记录并标记未掌握；答对标记掌握", async () => {
    const { family, student } = await seedDemo();
    const wrongQuestion = await createPublishedQuestion(student.id);
    const fam = await sessionFor(family.phone);

    const wrongRes = await addAttempt(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/attempts`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { answer: "x=2", result: "INCORRECT" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(wrongRes.status).toBe(200);
    expect(
      await prisma.wrongQuestionOccurrence.count({
        where: { wrongQuestionId: wrongQuestion.id },
      }),
    ).toBe(1);

    const correctRes = await addAttempt(
      authedRequest(
        `/api/v1/wrong-questions/${wrongQuestion.id}/attempts`,
        "POST",
        fam.sessionToken,
        fam.csrfToken,
        { answer: "x=4", result: "CORRECT" },
      ),
      { params: Promise.resolve({ id: wrongQuestion.id }) },
    );
    expect(correctRes.status).toBe(200);
    const updated = await prisma.wrongQuestion.findUniqueOrThrow({
      where: { id: wrongQuestion.id },
    });
    expect(updated.mastered).toBe(true);
  });

  it("生成月报草稿：本地统计 + AI 建议；重复生成幂等复用", async () => {
    const { admin, student } = await seedDemo();
    await createPublishedQuestion(student.id, "MATH", ["一元一次方程"]);
    const adminSession = await sessionFor(admin.phone);
    const month = "2026-06";

    const res = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        month,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.created).toBe(true);

    const summary = await prisma.learningSummary.findUniqueOrThrow({
      where: { id: body.data.reportId },
    });
    expect(summary.status).toBe("DRAFT");
    expect(summary.type).toBe("MONTHLY");
    expect((summary.stats as { totalWrongQuestions: number }).totalWrongQuestions).toBe(1);
    expect((summary.aiSuggestions as { suggestions: string[] }).suggestions.length).toBeGreaterThan(0);
    expect(summary.isAiGenerated).toBe(true);

    // 幂等：同周期重复生成返回同一份
    const dup = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        month,
      }),
    );
    const dupBody = await dup.json();
    expect(dup.status).toBe(200);
    expect(dupBody.data.reportId).toBe(body.data.reportId);
    expect(dupBody.data.created).toBe(false);
  });

  it("月报审核发布流程：DRAFT -> REVIEWED -> PUBLISHED，家庭端只看到已发布", async () => {
    const { admin, family, student } = await seedDemo();
    await createPublishedQuestion(student.id);
    const adminSession = await sessionFor(admin.phone);
    const gen = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        month: "2026-06",
      }),
    );
    const reportId = (await gen.json()).data.reportId;

    const fam = await sessionFor(family.phone);
    const before = await listReports(
      authedRequest("/api/v1/reports", "GET", fam.sessionToken, fam.csrfToken),
    );
    expect((await before.json()).data.items).toHaveLength(0);

    const reviewRes = await reviewReport(
      authedRequest(
        `/api/v1/reports/${reportId}/review`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
      ),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(reviewRes.status).toBe(200);
    const reviewed = await prisma.learningSummary.findUniqueOrThrow({
      where: { id: reportId },
    });
    expect(reviewed.status).toBe("REVIEWED");
    expect(reviewed.reviewerId).toBe(admin.id);
    expect(reviewed.isTeacherReviewed).toBe(true);

    const publishRes = await publishReport(
      authedRequest(
        `/api/v1/reports/${reportId}/publish`,
        "POST",
        adminSession.sessionToken,
        adminSession.csrfToken,
      ),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(publishRes.status).toBe(200);

    const after = await listReports(
      authedRequest("/api/v1/reports", "GET", fam.sessionToken, fam.csrfToken),
    );
    const afterBody = await after.json();
    expect(afterBody.data.items).toHaveLength(1);
    expect(afterBody.data.items[0].status).toBe("PUBLISHED");
    expect(afterBody.data.items[0].month).toBe("2026-06");
  });

  it("老师只能为自己负责的学生生成月报", async () => {
    const { teacher, student } = await seedDemo();
    const otherFamily = await createUser({
      phone: "13800000009",
      role: "FAMILY",
      name: "其他家长",
    });
    const otherAccount = await prisma.familyAccount.create({
      data: { userId: otherFamily.id },
    });
    const otherStudent = await prisma.student.create({
      data: {
        familyAccountId: otherAccount.id,
        name: "其他学生",
        grade: "初三",
        school: "其他中学",
      },
    });
    const teacherSession = await sessionFor(teacher.phone);

    const forbidden = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", teacherSession.sessionToken, teacherSession.csrfToken, {
        studentId: otherStudent.id,
        month: "2026-06",
      }),
    );
    expect(forbidden.status).toBe(403);

    const allowed = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", teacherSession.sessionToken, teacherSession.csrfToken, {
        studentId: student.id,
        month: "2026-06",
      }),
    );
    expect(allowed.status).toBe(200);
  });

  it("非负责老师审核/发布月报被拒绝（403）", async () => {
    const { admin, student } = await seedDemo();
    const otherTeacher = await createUser({
      phone: "13800000005",
      role: "TEACHER",
      name: "李老师",
    });
    await prisma.teacherProfile.create({ data: { userId: otherTeacher.id } });
    await createPublishedQuestion(student.id);
    const adminSession = await sessionFor(admin.phone);
    const gen = await generateReport(
      authedRequest("/api/v1/reports/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        month: "2026-06",
      }),
    );
    const reportId = (await gen.json()).data.reportId;

    const other = await sessionFor(otherTeacher.phone);
    const reviewRes = await reviewReport(
      authedRequest(
        `/api/v1/reports/${reportId}/review`,
        "PATCH",
        other.sessionToken,
        other.csrfToken,
      ),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(reviewRes.status).toBe(403);

    const publishRes = await publishReport(
      authedRequest(
        `/api/v1/reports/${reportId}/publish`,
        "POST",
        other.sessionToken,
        other.csrfToken,
      ),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(publishRes.status).toBe(403);
  });

  it("周报/学期总结：周期边界与幂等", async () => {
    const { admin, student } = await seedDemo();
    await createPublishedQuestion(student.id);
    const adminSession = await sessionFor(admin.phone);

    // 周报：指定周一日期，应覆盖周一至周日
    const week = "2026-06-01"; // 周一
    const weekPeriodCalc = weekPeriod(new Date(`${week}T00:00:00`));
    expect(weekPeriodCalc.periodStart.getDay()).toBe(1);
    expect(weekPeriodCalc.periodEnd.getTime() - weekPeriodCalc.periodStart.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );

    const weekRes = await generateSummary(
      authedRequest("/api/v1/summaries/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        type: "WEEKLY",
        week,
      }),
    );
    expect(weekRes.status).toBe(200);
    const weekBody = await weekRes.json();
    expect(weekBody.data.created).toBe(true);

    const dupWeek = await generateSummary(
      authedRequest("/api/v1/summaries/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        type: "WEEKLY",
        week,
      }),
    );
    const dupWeekBody = await dupWeek.json();
    expect(dupWeekBody.data.summaryId).toBe(weekBody.data.summaryId);
    expect(dupWeekBody.data.created).toBe(false);

    // 学期：创建学期后用 termId 生成
    const termRes = await createTerm(
      authedRequest("/api/v1/admin/academic-terms", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        name: "2026 春季学期",
        startDate: "2026-02-01T00:00:00Z",
        endDate: "2026-06-30T00:00:00Z",
        isActive: true,
      }),
    );
    expect(termRes.status).toBe(200);
    const termId = (await termRes.json()).data.termId;

    const semesterRes = await generateSummary(
      authedRequest("/api/v1/summaries/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        type: "SEMESTER",
        termId,
      }),
    );
    expect(semesterRes.status).toBe(200);
    const semester = await prisma.learningSummary.findUniqueOrThrow({
      where: { id: (await semesterRes.json()).data.summaryId },
    });
    expect(semester.type).toBe("SEMESTER");
  });

  it("学期管理：创建、列表、修改", async () => {
    const { admin } = await seedDemo();
    const adminSession = await sessionFor(admin.phone);

    const created = await createTerm(
      authedRequest("/api/v1/admin/academic-terms", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        name: "2026 秋季学期",
        startDate: "2026-09-01T00:00:00Z",
        endDate: "2027-01-31T00:00:00Z",
      }),
    );
    expect(created.status).toBe(200);
    const termId = (await created.json()).data.termId;

    const listRes = await listTerms(
      authedRequest("/api/v1/admin/academic-terms", "GET", adminSession.sessionToken, adminSession.csrfToken),
    );
    const listBody = await listRes.json();
    expect(listBody.data.items).toHaveLength(1);
    expect(listBody.data.items[0].name).toBe("2026 秋季学期");

    const updated = await updateTerm(
      authedRequest(
        `/api/v1/admin/academic-terms/${termId}`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
        { isActive: false, name: "2026 秋季学期（停用）" },
      ),
      { params: Promise.resolve({ id: termId }) },
    );
    expect(updated.status).toBe(200);
    const term = await prisma.academicTerm.findUniqueOrThrow({
      where: { id: termId },
    });
    expect(term.isActive).toBe(false);
    expect(term.name).toBe("2026 秋季学期（停用）");
  });

  it("练习/模拟题组独立接口：家庭只能看自己学生的", async () => {
    const { family, student } = await seedDemo();
    const otherFamily = await createUser({
      phone: "13800000009",
      role: "FAMILY",
      name: "其他家长",
    });
    const otherAccount = await prisma.familyAccount.create({
      data: { userId: otherFamily.id },
    });
    const otherStudent = await prisma.student.create({
      data: {
        familyAccountId: otherAccount.id,
        name: "其他学生",
        grade: "初三",
        school: "其他中学",
      },
    });
    await prisma.practiceSet.create({
      data: {
        studentId: otherStudent.id,
        title: "其他学生练习",
        questions: {
          create: {
            question: "1+1=?",
            answer: "2",
            explanation: "加法",
          },
        },
      },
    });

    const fam = await sessionFor(family.phone);
    const res = await listPracticeSets(
      authedRequest("/api/v1/practice-sets", "GET", fam.sessionToken, fam.csrfToken),
    );
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
    void student;
  });

  it("老师可基于数学错题生成 3-5 道模拟题并入库", async () => {
    const { family, teacher, student } = await seedDemo();
    await createPublishedQuestion(student.id, "MATH", ["一元一次方程"]);
    const teacherSession = await sessionFor(teacher.phone);

    const generated = await generatePracticeSet(
      authedRequest(
        "/api/v1/practice-sets/generate",
        "POST",
        teacherSession.sessionToken,
        teacherSession.csrfToken,
        { studentId: student.id, count: 4 },
      ),
    );
    expect(generated.status).toBe(200);
    const generatedBody = await generated.json();
    expect(generatedBody.data.questions).toHaveLength(4);
    expect(generatedBody.data.title).toContain("数学");

    const stored = await prisma.practiceSet.findUniqueOrThrow({
      where: { id: generatedBody.data.id },
      include: { questions: true },
    });
    expect(stored.questions).toHaveLength(4);

    const familySession = await sessionFor(family.phone);
    const listed = await listPracticeSets(
      authedRequest(
        "/api/v1/practice-sets",
        "GET",
        familySession.sessionToken,
        familySession.csrfToken,
      ),
    );
    expect((await listed.json()).data.items).toHaveLength(1);
  });

  it("家庭账户只能为绑定学生生成模拟题", async () => {
    const { family, student } = await seedDemo();
    const otherFamily = await createUser({
      phone: "13800000009",
      role: "FAMILY",
      name: "其他家长",
    });
    const otherAccount = await prisma.familyAccount.create({
      data: { userId: otherFamily.id },
    });
    const otherStudent = await prisma.student.create({
      data: {
        familyAccountId: otherAccount.id,
        name: "其他学生",
        grade: "初三",
        school: "其他中学",
      },
    });
    await createPublishedQuestion(student.id);
    const familySession = await sessionFor(family.phone);
    const response = await generatePracticeSet(
      authedRequest(
        "/api/v1/practice-sets/generate",
        "POST",
        familySession.sessionToken,
        familySession.csrfToken,
        { studentId: student.id, count: 5 },
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.studentId).toBe(student.id);

    const otherStudentResponse = await generatePracticeSet(
      authedRequest(
        "/api/v1/practice-sets/generate",
        "POST",
        familySession.sessionToken,
        familySession.csrfToken,
        { studentId: otherStudent.id, count: 5 },
      ),
    );
    expect(otherStudentResponse.status).toBe(403);
  });

  it("总结列表：家庭只看到已发布，老师只能看负责学生", async () => {
    const { admin, family, teacher, student } = await seedDemo();
    await createPublishedQuestion(student.id);
    const adminSession = await sessionFor(admin.phone);
    const monthPeriod = monthPeriodFromString("2026-06");
    const gen = await generateSummary(
      authedRequest("/api/v1/summaries/generate", "POST", adminSession.sessionToken, adminSession.csrfToken, {
        studentId: student.id,
        type: "MONTHLY",
        periodStart: monthPeriod.periodStart.toISOString(),
        periodEnd: monthPeriod.periodEnd.toISOString(),
      }),
    );
    expect(gen.status).toBe(200);
    const summaryId = (await gen.json()).data.summaryId;

    const fam = await sessionFor(family.phone);
    const famList = await listSummaries(
      authedRequest("/api/v1/summaries", "GET", fam.sessionToken, fam.csrfToken),
    );
    expect((await famList.json()).data.items).toHaveLength(0);

    const teacherSession = await sessionFor(teacher.phone);
    const teacherList = await listSummaries(
      authedRequest("/api/v1/summaries", "GET", teacherSession.sessionToken, teacherSession.csrfToken),
    );
    const teacherBody = await teacherList.json();
    expect(teacherBody.data.items).toHaveLength(1);
    expect(teacherBody.data.items[0].id).toBe(summaryId);

    // 先审核再发布
    const reviewRes = await reviewSummary(
      authedRequest(
        `/api/v1/summaries/${summaryId}/review`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
      ),
      { params: Promise.resolve({ id: summaryId }) },
    );
    expect(reviewRes.status).toBe(200);

    // 发布后家庭可见
    await publishSummary(
      authedRequest(
        `/api/v1/summaries/${summaryId}/publish`,
        "POST",
        adminSession.sessionToken,
        adminSession.csrfToken,
      ),
      { params: Promise.resolve({ id: summaryId }) },
    );
    const famAfter = await listSummaries(
      authedRequest("/api/v1/summaries", "GET", fam.sessionToken, fam.csrfToken),
    );
    const famBody = await famAfter.json();
    expect(famBody.data.items).toHaveLength(1);
    expect(famBody.data.items[0].status).toBe("PUBLISHED");
  });
});
