import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword, verifyPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { POST as createAssignment } from "./assignments/route";
import { DELETE as deleteAssignment } from "./assignments/[id]/route";
import { GET as listStudents } from "./students/route";
import { PATCH as patchStudent } from "./students/[id]/route";
import { DELETE as disableStudent } from "./students/[id]/route";
import { POST as createTeacher } from "./teachers/route";
import { DELETE as disableTeacher } from "./teachers/[id]/route";
import { POST as createFamilyAccount, GET as listFamilyAccounts } from "./family-accounts/route";
import { POST as resetPassword } from "./teachers/[id]/reset-password/route";
import { GET as getMyStudent } from "../me/student/route";
import { GET as getTeacherStudents } from "../teacher/students/route";
import { POST as login } from "../auth/login/route";

describe("账户与学生/老师管理 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    // 清空涉及表，保证用例互不干扰
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.guardianConsent.deleteMany();
    await prisma.studentAnswerAttempt.deleteMany();
    await prisma.wrongQuestion.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.courseSlot.deleteMany();
    await prisma.makeupCredit.deleteMany();
    await prisma.studentEntitlement.deleteMany();
    await prisma.packagePlan.deleteMany();
    await prisma.teacherStudentAssignment.deleteMany();
    await prisma.student.deleteMany();
    await prisma.familyAccount.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.systemSetting.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(data: {
    phone: string;
    role: "ADMIN" | "TEACHER" | "FAMILY";
    name: string;
    password?: string;
    mustChangePassword?: boolean;
  }) {
    return prisma.user.create({
      data: {
        phone: data.phone,
        passwordHash: await hashPassword(data.password ?? "Temp@123456"),
        role: data.role,
        name: data.name,
        mustChangePassword: data.mustChangePassword ?? true,
      },
    });
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

  async function doLogin(phone: string, password = "Temp@123456") {
    return login(
      jsonRequest("/api/v1/auth/login", "POST", { phone, password }),
    );
  }

  async function authedSession(phone: string) {
    const res = await doLogin(phone);
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

  /** 建立一套演示数据：管理员、老师（黄冠）、家庭（演示学生 A + 负责关系） */
  async function seedDemo() {
    const admin = await createUser({
      phone: "13800000001",
      role: "ADMIN",
      name: "系统管理员",
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
      data: {
        userId: teacher.id,
        university: "中国石油大学",
        major: "数学",
        degree: "本科",
      },
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

  it("家庭端 GET /me/student 只返回自己绑定的学生", async () => {
    const { family, student } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const res = await getMyStudent(
      authedRequest("/api/v1/me/student", "GET", sessionToken, csrfToken),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.student.id).toBe(student.id);
    expect(body.data.student.name).toBe("演示学生 A");
  });

  it("老师端 GET /teacher/students 只返回负责的学生", async () => {
    const { teacher } = await seedDemo();
    // 额外创建一个不属于该老师的学生
    const otherFamily = await createUser({
      phone: "13800000004",
      role: "FAMILY",
      name: "其他家长",
    });
    const otherAccount = await prisma.familyAccount.create({
      data: { userId: otherFamily.id },
    });
    await prisma.student.create({
      data: {
        familyAccountId: otherAccount.id,
        name: "其他学生",
        grade: "初三",
        school: "其他中学",
      },
    });

    const { sessionToken, csrfToken } = await authedSession(teacher.phone);
    const res = await getTeacherStudents(
      authedRequest("/api/v1/teacher/students", "GET", sessionToken, csrfToken),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.students).toHaveLength(1);
    expect(body.data.students[0].student.name).toBe("演示学生 A");
  });

  it("非管理员访问管理员接口返回 403", async () => {
    const { family } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(family.phone);
    const res = await listStudents(
      authedRequest("/api/v1/admin/students", "GET", sessionToken, csrfToken),
    );
    expect(res.status).toBe(403);
  });

  it("未登录访问返回 401", async () => {
    const res = await listStudents(
      jsonRequest("/api/v1/admin/students", "GET"),
    );
    expect(res.status).toBe(401);
  });

  it("管理员创建老师：返回一次性临时密码并写审计日志", async () => {
    const { admin } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const res = await createTeacher(
      authedRequest("/api/v1/admin/teachers", "POST", sessionToken, csrfToken, {
        phone: "13800000005",
        name: "李老师",
        university: "清华大学",
        major: "英语",
        degree: "硕士",
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);

    const created = await prisma.user.findUnique({
      where: { phone: "13800000005" },
    });
    expect(created).not.toBeNull();
    expect(created!.mustChangePassword).toBe(true);
    expect(created!.passwordHash).not.toContain(body.data.tempPassword);

    const audit = await prisma.auditLog.count({
      where: { action: "CREATE_TEACHER" },
    });
    expect(audit).toBe(1);
  });

  it("创建老师时重复手机号返回 409", async () => {
    const { admin, teacher } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const res = await createTeacher(
      authedRequest("/api/v1/admin/teachers", "POST", sessionToken, csrfToken, {
        phone: teacher.phone,
        name: "重复手机号",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("管理员创建家庭账户与学生资料，密码只在创建响应返回一次", async () => {
    const { admin } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);
    const response = await createFamilyAccount(
      authedRequest("/api/v1/admin/family-accounts", "POST", sessionToken, csrfToken, {
        phone: "13800000009", studentName: "新学生", grade: "初三", school: "实验中学",
      }),
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const created = await prisma.user.findUniqueOrThrow({
      where: { phone: "13800000009" }, include: { familyAccount: { include: { student: true } } },
    });
    expect(created.role).toBe("FAMILY");
    expect(created.mustChangePassword).toBe(true);
    expect(await verifyPassword(data.tempPassword, created.passwordHash)).toBe(true);
    expect(created.familyAccount?.student?.id).toBe(data.account.studentId);
    expect(created.familyAccount?.student?.name).toBe("新学生");
    expect(await prisma.auditLog.count({ where: { action: "CREATE_FAMILY_ACCOUNT" } })).toBe(1);

    const listed = await listFamilyAccounts(authedRequest("/api/v1/admin/family-accounts", "GET", sessionToken, csrfToken));
    const listedBody = await listed.json();
    expect(JSON.stringify(listedBody)).not.toContain(data.tempPassword);
    expect(JSON.stringify(listedBody)).not.toContain("passwordHash");
  });

  it("家庭账户创建拒绝重复手机号和非管理员", async () => {
    const { admin, family } = await seedDemo();
    const adminSession = await authedSession(admin.phone);
    const before = await prisma.user.count();
    const repeated = await createFamilyAccount(authedRequest("/api/v1/admin/family-accounts", "POST", adminSession.sessionToken, adminSession.csrfToken, {
      phone: family.phone, studentName: "重复账户",
    }));
    expect(repeated.status).toBe(409);
    expect(await prisma.user.count()).toBe(before);
    const familySession = await authedSession(family.phone);
    const forbidden = await createFamilyAccount(authedRequest("/api/v1/admin/family-accounts", "POST", familySession.sessionToken, familySession.csrfToken, {
      phone: "13800000009", studentName: "越权创建",
    }));
    expect(forbidden.status).toBe(403);
  });

  it("停用家庭账户撤销会话并解除负责关系，保留学生历史资料", async () => {
    const { admin, family, student } = await seedDemo();
    const adminSession = await authedSession(admin.phone);
    await authedSession(family.phone);
    const response = await disableStudent(
      authedRequest(`/api/v1/admin/students/${student.id}`, "DELETE", adminSession.sessionToken, adminSession.csrfToken),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(response.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: family.id } });
    expect(user.isActive).toBe(false);
    expect(user.deletedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: family.id } })).toBe(0);
    expect(await prisma.teacherStudentAssignment.count({ where: { studentId: student.id, endsAt: null } })).toBe(0);
    expect(await prisma.student.findUnique({ where: { id: student.id } })).not.toBeNull();
    expect((await doLogin(family.phone)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "DISABLE_FAMILY_ACCOUNT" } })).toBe(1);
  });

  it("停用老师账户解除负责关系并撤销全部会话", async () => {
    const { admin, teacher, teacherProfile } = await seedDemo();
    const adminSession = await authedSession(admin.phone);
    await authedSession(teacher.phone);
    const response = await disableTeacher(
      authedRequest(`/api/v1/admin/teachers/${teacherProfile.id}`, "DELETE", adminSession.sessionToken, adminSession.csrfToken),
      { params: Promise.resolve({ id: teacherProfile.id }) },
    );
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: teacher.id } })).isActive).toBe(false);
    expect(await prisma.session.count({ where: { userId: teacher.id } })).toBe(0);
    expect(await prisma.teacherStudentAssignment.count({ where: { teacherId: teacherProfile.id, endsAt: null } })).toBe(0);
    expect(await prisma.teacherProfile.findUnique({ where: { id: teacherProfile.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "DISABLE_TEACHER_ACCOUNT" } })).toBe(1);
  });

  it("学生列表分页可访问第 100 名之后的学生", async () => {
    const { admin, family } = await seedDemo();
    await prisma.$transaction(Array.from({ length: 101 }, (_, index) => prisma.user.create({
      data: {
        phone: `13900000${String(index).padStart(3, "0")}`,
        passwordHash: family.passwordHash,
        role: "FAMILY",
        name: `分页学生 ${index}`,
        familyAccount: { create: { student: { create: { name: `分页学生 ${index}`, grade: "初二", school: "测试中学" } } } },
      },
    })));
    const { sessionToken, csrfToken } = await authedSession(admin.phone);
    const response = await listStudents(authedRequest("/api/v1/admin/students?page=6&pageSize=20", "GET", sessionToken, csrfToken));
    const { data } = await response.json();
    expect(response.status).toBe(200);
    expect(data.total).toBe(102);
    expect(data.page).toBe(6);
    expect(data.students).toHaveLength(2);
    expect(data.students.every((student: { isActive: boolean }) => student.isActive)).toBe(true);
  });

  it("管理员重置密码：撤销全部 Session 并强制改密", async () => {
    const { admin, family } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);
    // 家庭用户先登录，建立旧会话
    const familyLogin = await doLogin(family.phone);
    const oldSessionToken = familyLogin.cookies.get(SESSION_COOKIE_NAME)!.value;

    const res = await resetPassword(
      authedRequest(
        `/api/v1/admin/teachers/${family.id}/reset-password`,
        "POST",
        sessionToken,
        csrfToken,
      ),
      { params: Promise.resolve({ id: family.id }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);

    const updated = await prisma.user.findUnique({
      where: { id: family.id },
    });
    expect(updated!.mustChangePassword).toBe(true);

    // 旧会话已撤销：用旧 token 访问 /me 应 401
    const { GET: me } = await import("../auth/me/route");
    const meRes = await me(
      authedRequest("/api/v1/auth/me", "GET", oldSessionToken, csrfToken),
    );
    expect(meRes.status).toBe(401);
  });

  it("管理员修改学生信息并写审计日志", async () => {
    const { admin, student } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const res = await patchStudent(
      authedRequest(
        `/api/v1/admin/students/${student.id}`,
        "PATCH",
        sessionToken,
        csrfToken,
        { name: "演示学生 B" },
      ),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(res.status).toBe(200);
    const updated = await prisma.student.findUniqueOrThrow({
      where: { id: student.id },
    });
    expect(updated.name).toBe("演示学生 B");

    const audit = await prisma.auditLog.count({
      where: { action: "UPDATE_STUDENT" },
    });
    expect(audit).toBe(1);
  });

  it("创建分配关系并解除（软结束）", async () => {
    const { admin, teacherProfile } = await seedDemo();
    // 新增一个学生
    const otherFamily = await createUser({
      phone: "13800000006",
      role: "FAMILY",
      name: "家长二",
    });
    const otherAccount = await prisma.familyAccount.create({
      data: { userId: otherFamily.id },
    });
    const newStudent = await prisma.student.create({
      data: {
        familyAccountId: otherAccount.id,
        name: "学生二",
        grade: "高一",
        school: "实验中学",
      },
    });

    const { sessionToken, csrfToken } = await authedSession(admin.phone);
    const createRes = await createAssignment(
      authedRequest("/api/v1/admin/assignments", "POST", sessionToken, csrfToken, {
        teacherId: teacherProfile.id,
        studentId: newStudent.id,
      }),
    );
    expect(createRes.status).toBe(200);
    const createdBody = await createRes.json();

    const deleteRes = await deleteAssignment(
      authedRequest(
        `/api/v1/admin/assignments/${createdBody.data.assignment.id}`,
        "DELETE",
        sessionToken,
        csrfToken,
      ),
      { params: Promise.resolve({ id: createdBody.data.assignment.id }) },
    );
    expect(deleteRes.status).toBe(200);
    const ended = await prisma.teacherStudentAssignment.findUniqueOrThrow({
      where: { id: createdBody.data.assignment.id },
    });
    expect(ended.endsAt).not.toBeNull();
  });

  it("状态变更接口拒绝跨域 Origin 与缺失 CSRF", async () => {
    const { admin } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const crossOrigin = await createTeacher(
      jsonRequest("/api/v1/admin/teachers", "POST", {
        phone: "13800000007",
        name: "跨域老师",
      }, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "x-csrf-token": csrfToken,
        origin: "http://evil.example.com",
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const missingToken = await createTeacher(
      jsonRequest("/api/v1/admin/teachers", "POST", {
        phone: "13800000008",
        name: "无令牌老师",
      }, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        origin: baseUrl,
      }),
    );
    expect(missingToken.status).toBe(403);
  });
});
