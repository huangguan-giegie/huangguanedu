import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "../../../../generated/prisma/client";
import { createTestPrisma } from "../../../../lib/test-db";
import { createSession, SESSION_COOKIE_NAME } from "../../../../lib/session";
import { CSRF_COOKIE_NAME } from "../../../../lib/csrf";
import { runPracticeGenerationJob } from "../../../../lib/practice-set";
import { POST } from "./generate/route";
import { GET as status } from "./generate/status/route";
import { GET as sources } from "./sources/route";
import { GET as detail } from "./[id]/route";

vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: vi.fn() }));

describe("模拟题 API 权限与异步任务", () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = await createTestPrisma(); });
  afterAll(async () => { await prisma.$disconnect(); });
  async function fixture() {
    const prefix = Math.random().toString(36).slice(2);
    const family = await prisma.user.create({ data: { phone: `${prefix}-f`, name: "测试家庭", passwordHash: "unused", role: "FAMILY", familyAccount: { create: { student: { create: { name: "测试学生", grade: "初二", school: "测试" } } } } }, include: { familyAccount: { include: { student: true } } } });
    const teacher = await prisma.user.create({ data: { phone: `${prefix}-t`, name: "测试老师", passwordHash: "unused", role: "TEACHER", teacherProfile: { create: {} } }, include: { teacherProfile: true } });
    const studentId = family.familyAccount!.student!.id;
    const q = await prisma.wrongQuestion.create({ data: { studentId, subject: "ENGLISH", status: "PUBLISHED", recognizedQuestion: "He ___ home yesterday.", finalAnswer: "went", correctSteps: ["用一般过去时"] } });
    const token = (await createSession(prisma, family.id)).token;
    const teacherToken = (await createSession(prisma, teacher.id)).token;
    return { family, teacher, studentId, q, token, teacherToken };
  }
  function request(path: string, token: string, body?: unknown) {
    return new NextRequest(`http://localhost:3000/api/v1/practice-sets${path}`, { method: body ? "POST" : "GET", headers: { cookie: `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=test-csrf`, origin: "http://localhost:3000", "x-csrf-token": "test-csrf", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  it("家庭英语出题立即返回任务、持久化完成且再次执行不重复生成", async () => {
    const f = await fixture();
    const response = await POST(request("/generate", f.token, { wrongQuestionIds: [f.q.id], difficulty: "EASY" }));
    expect(response.status).toBe(202);
    const { data } = await response.json();
    const pending = await prisma.practiceGenerationJob.findUniqueOrThrow({ where: { id: data.jobId } }); expect(pending.status).toBe("PENDING"); expect(pending.requestedById).toBe(f.family.id);
    await runPracticeGenerationJob(prisma, pending.id); await runPracticeGenerationJob(prisma, pending.id);
    const completed = await (await status(request(`/generate/status?jobId=${pending.id}`, f.token))).json();
    expect(completed.data.status).toBe("DONE"); expect(completed.data.error).toBeNull();
    const set = await (await detail(request(`/${completed.data.practiceSetId}`, f.token), { params: Promise.resolve({ id: completed.data.practiceSetId }) })).json();
    expect(set.data.questions).toHaveLength(1); expect(set.data.questions[0].answer).toBe("went");
    expect(await prisma.practiceSet.count({ where: { studentId: f.studentId } })).toBe(1);
  });
  it("老师只能读取和生成当前负责学生的题", async () => {
    const f = await fixture();
    expect((await POST(request("/generate", f.teacherToken, { studentId: f.studentId, wrongQuestionIds: [f.q.id] }))).status).toBe(403);
    await prisma.teacherStudentAssignment.create({ data: { studentId: f.studentId, teacherId: f.teacher.teacherProfile!.id } });
    const source = await (await sources(request(`/sources?studentId=${f.studentId}&subject=ENGLISH`, f.teacherToken))).json(); expect(source.data.items[0].id).toBe(f.q.id);
    expect((await POST(request("/generate", f.teacherToken, { studentId: f.studentId, wrongQuestionIds: [f.q.id] }))).status).toBe(202);
  });
  it("家庭不能选择别人的学生，伪造错题或超过20题被拒绝", async () => {
    const f = await fixture();
    expect((await POST(request("/generate", f.token, { studentId: "other", wrongQuestionIds: [f.q.id] }))).status).toBe(403);
    expect((await POST(request("/generate", f.token, { wrongQuestionIds: ["unknown"] }))).status).toBe(404);
    expect((await POST(request("/generate", f.token, { wrongQuestionIds: Array(21).fill(f.q.id) }))).status).toBe(400);
  });
  it("状态查询可恢复本人任务，过期处理中任务给明确错误", async () => {
    const f = await fixture();
    const job = await prisma.practiceGenerationJob.create({ data: { studentId: f.studentId, requestedById: f.family.id, wrongQuestionIds: [f.q.id], status: "PROCESSING", updatedAt: new Date(Date.now() - 11 * 60 * 1000) } });
    const response = await (await status(request("/generate/status", f.token))).json(); expect(response.data.items[0].jobId).toBe(job.id); expect(response.data.items[0].status).toBe("FAILED");
    expect((await status(request(`/generate/status?jobId=${job.id}`, f.teacherToken))).status).toBe(404);
  });
});
