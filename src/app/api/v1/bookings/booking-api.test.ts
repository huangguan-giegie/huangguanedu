import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { PrismaClient } from "../../../../generated/prisma/client";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { hashPassword } from "../../../../lib/password";
import { SESSION_COOKIE_NAME } from "../../../../lib/session";
import { createTestPrisma } from "../../../../lib/test-db";
import { GET as listSlots } from "../course-slots/route";
import { POST as createBooking } from "./route";
import { PATCH as cancelBooking } from "./[id]/cancel/route";
import { POST as createSlot } from "../admin/course-slots/route";
import { PATCH as patchBooking } from "../admin/bookings/[id]/route";
import { POST as addMakeupCredit } from "../admin/students/[id]/makeup-credits/route";
import { PATCH as patchEntitlement } from "../admin/entitlements/[id]/route";
import { POST as login } from "../auth/login/route";

describe("一对一预约 API", () => {
  let prisma: PrismaClient;
  const baseUrl = "http://localhost:3000";

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.makeupCredit.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.courseSlot.deleteMany();
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

  async function doLogin(phone: string) {
    return login(
      jsonRequest("/api/v1/auth/login", "POST", {
        phone,
        password: "Temp@123456",
      }),
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

  /** 建立演示数据：管理员、老师、家庭（学生 A + 一对一权益 remainingHours=2） */
  async function seedDemo(hours = 2) {
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
    const plan = await prisma.packagePlan.create({
      data: {
        name: "一对一课时",
        type: "ONE_ON_ONE",
        priceCents: 30000,
        periodText: "按小时",
      },
    });
    const entitlement = await prisma.studentEntitlement.create({
      data: {
        studentId: student.id,
        planId: plan.id,
        paid: true,
        remainingHours: hours,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return { admin, teacher, family, teacherProfile, familyAccount, student, entitlement };
  }

  /** 创建未来的一对一时段 */
  async function createFutureSlot(
    teacherId: string,
    startOffsetHours = 48,
  ) {
    const start = new Date(Date.now() + startOffsetHours * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return prisma.courseSlot.create({
      data: {
        type: "ONE_ON_ONE",
        grade: "初二",
        subject: "MATH",
        teacherId,
        date: start,
        startTime: start,
        endTime: end,
        location: "712 社区",
        capacity: 1,
      },
    });
  }

  it("家庭端查看可预约时段（仅一对一）", async () => {
    const { family, teacherProfile } = await seedDemo();
    const slot = await createFutureSlot(teacherProfile.id);
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const res = await listSlots(
      authedRequest("/api/v1/course-slots", "GET", sessionToken, csrfToken),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.slots).toHaveLength(1);
    expect(body.data.slots[0].id).toBe(slot.id);
    expect(body.data.smallClassNote).toContain("小班课");
  });

  it("预约成功：锁定 1 课时、时段变 FULL", async () => {
    const { family, teacherProfile, student, entitlement } = await seedDemo();
    const slot = await createFutureSlot(teacherProfile.id);
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const res = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot.id,
      }),
    );
    expect(res.status).toBe(200);

    const updatedEntitlement = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updatedEntitlement.remainingHours).toBe(1);
    const booking = await prisma.booking.findFirstOrThrow({
      where: { studentId: student.id },
    });
    expect(booking.lockedHours).toBe(1);
    expect(booking.entitlementId).toBe(entitlement.id);
    const updatedSlot = await prisma.courseSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(updatedSlot.status).toBe("FULL");
  });

  it("重复预约同一时段返回 409", async () => {
    const { family, teacherProfile } = await seedDemo();
    const slot = await createFutureSlot(teacherProfile.id);
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot.id,
      }),
    );
    const dup = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot.id,
      }),
    );
    expect(dup.status).toBe(409);
  });

  it("学生时间冲突：同一时间段第二个预约被拒", async () => {
    const { family, teacherProfile } = await seedDemo(3);
    const slot1 = await createFutureSlot(teacherProfile.id, 48);
    // 重叠时段（同一老师，但不同时段记录）
    const start2 = new Date(slot1.startTime.getTime() + 30 * 60 * 1000);
    const slot2 = await prisma.courseSlot.create({
      data: {
        type: "ONE_ON_ONE",
        grade: "初二",
        subject: "ENGLISH",
        teacherId: teacherProfile.id,
        date: start2,
        startTime: start2,
        endTime: new Date(start2.getTime() + 60 * 60 * 1000),
        location: "712 社区",
        capacity: 1,
      },
    });
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const first = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot1.id,
      }),
    );
    expect(first.status).toBe(200);
    const conflict = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot2.id,
      }),
    );
    expect(conflict.status).toBe(409);
    const body = await conflict.json();
    expect(body.error.code).toBe("TIME_CONFLICT");
  });

  it("创建时段时老师时间冲突被拒", async () => {
    const { admin, teacherProfile } = await seedDemo();
    const slot = await createFutureSlot(teacherProfile.id, 48);
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const overlapStart = new Date(slot.startTime.getTime() + 30 * 60 * 1000);
    const res = await createSlot(
      authedRequest("/api/v1/admin/course-slots", "POST", sessionToken, csrfToken, {
        type: "ONE_ON_ONE",
        grade: "初二",
        subject: "ENGLISH",
        teacherId: teacherProfile.id,
        date: overlapStart.toISOString(),
        startTime: overlapStart.toISOString(),
        endTime: new Date(overlapStart.getTime() + 60 * 60 * 1000).toISOString(),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("TEACHER_TIME_CONFLICT");
  });

  it("小班容量超过 5 被拒；小班时段不可在线预约", async () => {
    const { admin, family, teacherProfile } = await seedDemo();
    const { sessionToken, csrfToken } = await authedSession(admin.phone);

    const tooBig = await createSlot(
      authedRequest("/api/v1/admin/course-slots", "POST", sessionToken, csrfToken, {
        type: "SMALL_CLASS",
        grade: "初二",
        subject: "MATH",
        teacherId: teacherProfile.id,
        date: new Date(Date.now() + 72 * 3600000).toISOString(),
        startTime: new Date(Date.now() + 72 * 3600000).toISOString(),
        endTime: new Date(Date.now() + 72 * 3600000 + 90 * 60000).toISOString(),
        capacity: 6,
      }),
    );
    expect(tooBig.status).toBe(400);

    const smallClass = await prisma.courseSlot.create({
      data: {
        type: "SMALL_CLASS",
        grade: "初二",
        subject: "MATH",
        teacherId: teacherProfile.id,
        date: new Date(Date.now() + 96 * 3600000),
        startTime: new Date(Date.now() + 96 * 3600000),
        endTime: new Date(Date.now() + 96 * 3600000 + 90 * 60000),
        capacity: 5,
      },
    });
    const fam = await authedSession(family.phone);
    const booking = await createBooking(
      authedRequest("/api/v1/bookings", "POST", fam.sessionToken, fam.csrfToken, {
        slotId: smallClass.id,
      }),
    );
    expect(booking.status).toBe(400);
  });

  it("剩余课时不足拒绝预约", async () => {
    const { family, teacherProfile, entitlement } = await seedDemo(1);
    const slot1 = await createFutureSlot(teacherProfile.id, 48);
    const slot2 = await createFutureSlot(teacherProfile.id, 96);
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const first = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot1.id,
      }),
    );
    expect(first.status).toBe(200);
    const second = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot2.id,
      }),
    );
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error.code).toBe("NO_ENTITLEMENT");

    const updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.remainingHours).toBe(0);
  });

  it("提前 24h 取消释放课时；临期取消转已使用", async () => {
    const { family, teacherProfile, entitlement } = await seedDemo(2);
    const farSlot = await createFutureSlot(teacherProfile.id, 72);
    const nearSlot = await createFutureSlot(teacherProfile.id, 120);
    // 让 nearSlot 距离开始不足 24h
    const nearStart = new Date(Date.now() + 6 * 3600000);
    await prisma.courseSlot.update({
      where: { id: nearSlot.id },
      data: {
        date: nearStart,
        startTime: nearStart,
        endTime: new Date(nearStart.getTime() + 60 * 60 * 1000),
      },
    });
    const { sessionToken, csrfToken } = await authedSession(family.phone);

    const farRes = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: farSlot.id,
      }),
    );
    const farBody = await farRes.json();
    const nearRes = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: nearSlot.id,
      }),
    );
    const nearBody = await nearRes.json();

    // 提前取消 farSlot：释放课时
    const cancelFar = await cancelBooking(
      authedRequest(
        `/api/v1/bookings/${farBody.data.bookingId}/cancel`,
        "PATCH",
        sessionToken,
        csrfToken,
      ),
      { params: Promise.resolve({ id: farBody.data.bookingId }) },
    );
    expect(cancelFar.status).toBe(200);
    let updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.remainingHours).toBe(1);
    expect(updated.usedHours).toBe(0);

    // 临期取消 nearSlot：转已使用
    const cancelNear = await cancelBooking(
      authedRequest(
        `/api/v1/bookings/${nearBody.data.bookingId}/cancel`,
        "PATCH",
        sessionToken,
        csrfToken,
      ),
      { params: Promise.resolve({ id: nearBody.data.bookingId }) },
    );
    expect(cancelNear.status).toBe(200);
    updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.remainingHours).toBe(1);
    expect(updated.usedHours).toBe(1);
  });

  it("管理员完成/缺席预约扣课时并写审计", async () => {
    const { admin, family, teacherProfile, entitlement } = await seedDemo(2);
    const slot = await createFutureSlot(teacherProfile.id, 48);
    const { sessionToken, csrfToken } = await authedSession(family.phone);
    const bookRes = await createBooking(
      authedRequest("/api/v1/bookings", "POST", sessionToken, csrfToken, {
        slotId: slot.id,
      }),
    );
    const { data } = await bookRes.json();
    const bookingId = data.bookingId;
    const adminSession = await authedSession(admin.phone);

    // 确认 -> 缺席
    const confirm = await patchBooking(
      authedRequest(
        `/api/v1/admin/bookings/${bookingId}`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
        { action: "CONFIRM" },
      ),
      { params: Promise.resolve({ id: bookingId }) },
    );
    expect(confirm.status).toBe(200);
    const absent = await patchBooking(
      authedRequest(
        `/api/v1/admin/bookings/${bookingId}`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
        { action: "ABSENT" },
      ),
      { params: Promise.resolve({ id: bookingId }) },
    );
    expect(absent.status).toBe(200);

    const updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.usedHours).toBe(1);
    expect(updated.remainingHours).toBe(1);
    const audit = await prisma.auditLog.count({
      where: { action: "BOOKING_ABSENT" },
    });
    expect(audit).toBe(1);
  });

  it("管理员补课与权益调整写审计", async () => {
    const { admin, student, entitlement } = await seedDemo(2);
    const adminSession = await authedSession(admin.phone);

    const makeup = await addMakeupCredit(
      authedRequest(
        `/api/v1/admin/students/${student.id}/makeup-credits`,
        "POST",
        adminSession.sessionToken,
        adminSession.csrfToken,
        { hours: 2, reason: "缺课补课" },
      ),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(makeup.status).toBe(200);
    let updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.remainingHours).toBe(4);
    const credit = await prisma.makeupCredit.findFirstOrThrow({
      where: { studentId: student.id },
    });
    expect(credit.hours).toBe(2);

    const adjust = await patchEntitlement(
      authedRequest(
        `/api/v1/admin/entitlements/${entitlement.id}`,
        "PATCH",
        adminSession.sessionToken,
        adminSession.csrfToken,
        { remainingHours: 6, monthlyOneOnOneHours: 6 },
      ),
      { params: Promise.resolve({ id: entitlement.id }) },
    );
    expect(adjust.status).toBe(200);
    updated = await prisma.studentEntitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(updated.remainingHours).toBe(6);
    expect(updated.monthlyOneOnOneHours).toBe(6);

    const audits = await prisma.auditLog.count({
      where: {
        action: { in: ["ADD_MAKEUP_CREDIT", "UPDATE_ENTITLEMENT"] },
      },
    });
    expect(audits).toBe(2);
  });

  it("家庭只能取消自己的预约", async () => {
    const { family, teacherProfile } = await seedDemo(2);
    // 第二个家庭 + 学生
    const family2 = await createUser({
      phone: "13800000004",
      role: "FAMILY",
      name: "家长二",
    });
    const account2 = await prisma.familyAccount.create({
      data: { userId: family2.id },
    });
    const student2 = await prisma.student.create({
      data: {
        familyAccountId: account2.id,
        name: "学生二",
        grade: "高一",
        school: "实验中学",
      },
    });
    const plan = await prisma.packagePlan.create({
      data: {
        name: "一对一课时",
        type: "ONE_ON_ONE",
        priceCents: 30000,
        periodText: "按小时",
      },
    });
    await prisma.studentEntitlement.create({
      data: {
        studentId: student2.id,
        planId: plan.id,
        paid: true,
        remainingHours: 2,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    const slot = await createFutureSlot(teacherProfile.id, 48);

    const fam1 = await authedSession(family.phone);
    const bookRes = await createBooking(
      authedRequest("/api/v1/bookings", "POST", fam1.sessionToken, fam1.csrfToken, {
        slotId: slot.id,
      }),
    );
    const created = await bookRes.json();
    const bookingId = created.data.bookingId;

    const fam2 = await authedSession(family2.phone);
    const forbidden = await cancelBooking(
      authedRequest(
        `/api/v1/bookings/${bookingId}/cancel`,
        "PATCH",
        fam2.sessionToken,
        fam2.csrfToken,
      ),
      { params: Promise.resolve({ id: bookingId }) },
    );
    expect(forbidden.status).toBe(403);
  });
});
