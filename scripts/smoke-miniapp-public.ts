// 公网迁移验收：只创建合成资料，凭证仅留在进程内，结束后停用验收账号。
import "dotenv/config";
import { randomBytes, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

type Subject = "MATH" | "ENGLISH";
type Check = { step: string; passed: boolean; code?: string; elapsedMs: number };
type RequestRecord = { step: string; method: string; status: number; elapsedMs: number };
type Question = { id: string; subject: Subject; status: string; recognizedQuestion: string | null; finalAnswer: string | null; correctSteps: unknown; imageIds: string[]; isFavorite: boolean; mastered: boolean | null; attempts: { id: string }[] };
type PracticeSet = { id: string; title: string; questions: { id: string; question: string; answer: string; explanation: string | null; imageUrl: string | null }[] };
type SourceResult = { kind: string; subject: Subject; id?: string; status?: string; imageCount?: number; recognizedQuestion?: string | null; answer?: string | null; explanation?: unknown; passed?: boolean };
type PracticeResult = { kind: string; jobId?: string; id?: string; title?: string; status?: string; passed?: boolean; questions?: { id: string; question: string; answer: string; explanation: string | null; imagePresent: boolean; validPng: boolean }[] };

class SmokeFailure extends Error {
  constructor(public readonly code: string) { super(code); }
}

const requests: RequestRecord[] = [];
const checks: Check[] = [];
const sources: SourceResult[] = [];
const practiceSets: PracticeResult[] = [];
const startedAt = Date.now();
const originUrl = new URL(process.env.PUBLIC_ORIGIN ?? "https://academy.huangguanedu.cn");
const origin = originUrl.origin;
const outputPath = resolve("docs/testing/miniapp-public-results.json");
const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));
function ensure(condition: unknown, code: string): asserts condition { if (!condition) throw new SmokeFailure(code); }
const safeCode = (error: unknown) => error instanceof SmokeFailure ? error.code : "UNEXPECTED_FAILURE";

async function checkpoint(step: string, action: () => Promise<void>) {
  const start = Date.now();
  try {
    await action();
    checks.push({ step, passed: true, elapsedMs: Date.now() - start });
  } catch (error) {
    checks.push({ step, passed: false, code: safeCode(error), elapsedMs: Date.now() - start });
  }
}

class PublicClient {
  private readonly cookies = new Map<string, string>();

  private rememberCookies(headers: Headers) {
    const values = headers.getSetCookie?.() ?? (headers.get("set-cookie")?.split(/,(?=\s*[^=;,\s]+=[^;,]*)/) ?? []);
    for (const value of values) {
      const pair = value.split(";")[0];
      const equals = pair.indexOf("=");
      if (equals > 0) this.cookies.set(pair.slice(0, equals).trim(), pair.slice(equals + 1));
    }
  }

  async request<T>(step: string, path: string, method = "GET", body?: unknown, expectedStatus?: number): Promise<{ status: number; data: T }> {
    const start = Date.now();
    const headers = new Headers({ Origin: origin, Accept: "application/json" });
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const csrf = this.cookies.get(process.env.CSRF_COOKIE_NAME ?? "yy_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
    if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(new URL(path, origin), { method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000), redirect: "manual" });
    } catch {
      requests.push({ step, method, status: 0, elapsedMs: Date.now() - start });
      throw new SmokeFailure("PUBLIC_REQUEST_FAILED");
    }
    requests.push({ step, method, status: response.status, elapsedMs: Date.now() - start });
    this.rememberCookies(response.headers);
    const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { code?: string } } | null;
    if (expectedStatus !== undefined) {
      ensure(response.status === expectedStatus, "EXPECTED_HTTP_STATUS_MISMATCH");
      return { status: response.status, data: payload?.data as T };
    }
    const apiCode = payload?.error?.code;
    ensure(response.ok && payload?.success === true, typeof apiCode === "string" && /^[A-Z0-9_]{1,60}$/.test(apiCode) ? apiCode : "PUBLIC_API_FAILED");
    return { status: response.status, data: payload.data as T };
  }

  async image(step: string, source: string, pngOnly: boolean): Promise<boolean> {
    let url = new URL(source, origin);
    for (let redirects = 0; redirects <= 4; redirects++) {
      ensure(url.protocol === "https:" || url.origin === origin, "INVALID_IMAGE_PROTOCOL");
      const start = Date.now();
      const headers = new Headers();
      if (url.origin === origin) headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
      let response: Response;
      try { response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) }); } catch { throw new SmokeFailure("IMAGE_FETCH_FAILED"); }
      requests.push({ step, method: "GET", status: response.status, elapsedMs: Date.now() - start });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        ensure(location, "IMAGE_REDIRECT_MISSING");
        url = new URL(location, url);
        continue;
      }
      ensure(response.ok, "IMAGE_HTTP_FAILED");
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata().catch(() => null);
      ensure(metadata?.width && metadata.height && metadata.width > 10 && metadata.height > 10, "IMAGE_INVALID");
      if (pngOnly) ensure(metadata.format === "png", "GENERATED_IMAGE_NOT_PNG");
      return true;
    }
    throw new SmokeFailure("IMAGE_REDIRECT_LIMIT");
  }
}

function svg(lines: string[], drawing = "") {
  const text = lines.map((line, index) => `<text x="44" y="${60 + index * 38}" font-size="25">${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="820"><rect width="1100" height="820" fill="white"/><g font-family="DejaVu Sans,Arial,sans-serif" fill="#222">${text}${drawing}</g></svg>`;
}

async function syntheticImages() {
  const geometry = svg([
    "Geometry practice - synthetic test", "Triangle ABC is right-angled at A.", "AB = 6 cm and AC = 8 cm. Find BC.", "Student answer: BC = 14 cm.",
  ], '<path d="M180 600 L180 330 L540 600 Z" fill="none" stroke="#222" stroke-width="4"/><path d="M180 578 L202 578 L202 600" fill="none" stroke="#222" stroke-width="3"/><text x="145" y="634" font-size="27">A</text><text x="150" y="315" font-size="27">B</text><text x="553" y="619" font-size="27">C</text><text x="112" y="470" font-size="27">6 cm</text><text x="315" y="640" font-size="27">8 cm</text><text x="370" y="443" font-size="27">BC = ?</text>');
  const parabola = Array.from({ length: 101 }, (_, index) => {
    const x = -0.5 + index * 0.05;
    return `${200 + x * 120},${560 - (x * x - 4 * x + 3) * 45}`;
  }).join(" ");
  const functions = svg([
    "Function practice - synthetic test", "Given y = x^2 - 4x + 3, find:", "1. The coordinates of the vertex.", "2. The two zeros of the function.", "Student answer: vertex (2, 1), zeros -1 and -3.",
  ], `<path d="M115 560 H805 M200 730 V300" fill="none" stroke="#555" stroke-width="2"/><polyline points="${parabola}" fill="none" stroke="#222" stroke-width="4"/><text x="810" y="582" font-size="24">x</text><text x="175" y="300" font-size="24">y</text><text x="176" y="590" font-size="23">0</text>${[1, 2, 3, 4].map((x) => `<path d="M${200 + x * 120} 554 v12" stroke="#222"/><text x="${193 + x * 120}" y="590" font-size="23">${x}</text>`).join("")}`);
  const englishOne = svg([
    "English reading practice - page 1 of 2", "Mia had a small school garden. Every morning, she", "watered the plants before her first lesson. One day", "she noticed that the soil was still wet after rain.", "She decided to save water and returned the next day.", "At the end of the month, her class measured the", "tomato plants. They had grown taller. Mia learned", "that careful observation could help her care for", "plants while using less water.", "Continue to page 2 for the questions.",
  ]);
  const englishTwo = svg([
    "English reading practice - page 2 of 2", "Read the story on page 1 and choose the best answer.", "1. Why did Mia not water the plants that day?", "A. She forgot her tools. B. The soil was already wet.", "C. The plants had died. D. Her lesson was cancelled.", "2. What did Mia learn from her garden?", "A. Watering more is always better.", "B. Plants cannot grow after rain.", "C. Careful observation can save water.", "D. Measuring plants is a waste of time.", "Student answers: 1. A   2. A",
  ]);
  return { geometry: [await sharp(Buffer.from(geometry)).png().toBuffer()], functions: [await sharp(Buffer.from(functions)).png().toBuffer()], english: [await sharp(Buffer.from(englishOne)).png().toBuffer(), await sharp(Buffer.from(englishTwo)).png().toBuffer()] };
}

async function waitForQuestion(client: PublicClient, id: string, kind: string): Promise<Question> {
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    const { data } = await client.request<{ wrongQuestion: Question }>(`${kind}:analysis-poll`, `/api/v1/wrong-questions/${id}`);
    if (data.wrongQuestion.status !== "PROCESSING") {
      ensure(data.wrongQuestion.recognizedQuestion?.trim(), "ANALYSIS_HAS_NO_QUESTION");
      ensure(data.wrongQuestion.finalAnswer?.trim(), "ANALYSIS_HAS_NO_ANSWER");
      return data.wrongQuestion;
    }
    await pause(5000);
  }
  throw new SmokeFailure("ANALYSIS_POLL_TIMEOUT");
}

async function waitForPractice(client: PublicClient, jobId: string, kind: string) {
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    const { data } = await client.request<{ status: string; practiceSetId: string | null }>(`${kind}:generation-poll`, `/api/v1/practice-sets/generate/status?jobId=${encodeURIComponent(jobId)}`);
    if (data.status === "FAILED") throw new SmokeFailure("PRACTICE_GENERATION_FAILED");
    if (data.status === "DONE") { ensure(data.practiceSetId, "PRACTICE_RESULT_MISSING"); return data.practiceSetId; }
    await pause(5000);
  }
  throw new SmokeFailure("PRACTICE_POLL_TIMEOUT");
}

async function uniquePhone(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const phone = `139${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
    if (!await prisma.user.findUnique({ where: { phone }, select: { id: true } })) return phone;
  }
  throw new SmokeFailure("TEST_PHONE_ALLOCATION_FAILED");
}

async function main() {
  ensure(!originUrl.username && !originUrl.password && ["http:", "https:"].includes(originUrl.protocol), "INVALID_PUBLIC_ORIGIN");
  ensure(process.env.QWEN_MODE?.trim() === "live", "LIVE_QWEN_REQUIRED");
  ensure(process.env.DATABASE_URL, "DATABASE_CONFIGURATION_REQUIRED");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const userIds: string[] = [];
  let studentId = "";
  let teacherProfileId = "";
  const family = new PublicClient();
  const teacher = new PublicClient();
  try {
    const familyPhone = await uniquePhone(prisma);
    let teacherPhone = await uniquePhone(prisma);
    while (teacherPhone === familyPhone) teacherPhone = await uniquePhone(prisma);
    const familyPassword = randomBytes(24).toString("base64url");
    const teacherPassword = randomBytes(24).toString("base64url");
    const [familyHash, teacherHash] = await Promise.all([hashPassword(familyPassword), hashPassword(teacherPassword)]);
    const setup = await prisma.$transaction(async (tx) => {
      const familyUser = await tx.user.create({ data: { phone: familyPhone, passwordHash: familyHash, role: "FAMILY", name: "迁移验收家庭", mustChangePassword: false } });
      const teacherUser = await tx.user.create({ data: { phone: teacherPhone, passwordHash: teacherHash, role: "TEACHER", name: "迁移验收老师", mustChangePassword: false } });
      const account = await tx.familyAccount.create({ data: { userId: familyUser.id } });
      const student = await tx.student.create({ data: { familyAccountId: account.id, name: "迁移验收示例", grade: "初三", school: "合成验收资料" } });
      const profile = await tx.teacherProfile.create({ data: { userId: teacherUser.id } });
      return { familyUserId: familyUser.id, teacherUserId: teacherUser.id, studentId: student.id, profileId: profile.id };
    });
    userIds.push(setup.familyUserId, setup.teacherUserId);
    studentId = setup.studentId;
    teacherProfileId = setup.profileId;
    await family.request("family:login", "/api/v1/auth/login", "POST", { phone: familyPhone, password: familyPassword });
    await teacher.request("teacher:login", "/api/v1/auth/login", "POST", { phone: teacherPhone, password: teacherPassword });
    const images = await syntheticImages();
    const sourceSpecs: { kind: keyof typeof images; subject: Subject; correctAnswer: string }[] = [{ kind: "geometry", subject: "MATH", correctAnswer: "BC = 10 cm" }, { kind: "functions", subject: "MATH", correctAnswer: "vertex (2, -1); zeros 1 and 3" }, { kind: "english", subject: "ENGLISH", correctAnswer: "1. B; 2. C" }];

    // 先上传全部合成题，验收真实后台调度器能处理分析队列。
    for (const spec of sourceSpecs) {
      const result: SourceResult = { kind: spec.kind, subject: spec.subject };
      sources.push(result);
      await checkpoint(`${spec.kind}:upload`, async () => {
        const form = new FormData();
        form.set("subject", spec.subject);
        form.set("model", "qwen-vl-plus");
        for (const [index, buffer] of images[spec.kind].entries()) form.append("image", new Blob([new Uint8Array(buffer)], { type: "image/png" }), `${spec.kind}-${index + 1}.png`);
        const { data } = await family.request<{ wrongQuestionId: string; imageIds: string[] }>(`${spec.kind}:upload`, "/api/v1/wrong-questions", "POST", form);
        result.id = data.wrongQuestionId;
        result.imageCount = data.imageIds.length;
        ensure(result.imageCount === images[spec.kind].length, "UPLOAD_IMAGE_COUNT_MISMATCH");
      });
    }

    const firstId = sources.find((source) => source.id)?.id;
    if (firstId) await checkpoint("teacher:unassigned-access-rejected", async () => {
      await teacher.request("teacher:unassigned-detail", `/api/v1/wrong-questions/${firstId}`, "GET", undefined, 403);
    });
    await prisma.teacherStudentAssignment.create({ data: { teacherId: teacherProfileId, studentId } });
    await checkpoint("teacher:assigned-student-visible", async () => {
      const { data } = await teacher.request<{ students: { student: { id: string } }[] }>("teacher:students", "/api/v1/teacher/students");
      ensure(data.students.some((item) => item.student.id === studentId), "ASSIGNED_STUDENT_MISSING");
    });

    for (const spec of sourceSpecs) {
      const result = sources.find((source) => source.kind === spec.kind)!;
      if (!result.id) continue;
      await checkpoint(`${spec.kind}:analysis-and-learning-flow`, async () => {
        const id = result.id!;
        const question = await waitForQuestion(family, id, spec.kind);
        result.status = question.status;
        result.recognizedQuestion = question.recognizedQuestion;
        result.answer = question.finalAnswer;
        result.explanation = question.correctSteps;
        const answer = `${question.finalAnswer} ${JSON.stringify(question.correctSteps)}`;
        if (spec.kind === "geometry") ensure(/\b10\b/.test(answer), "GEOMETRY_ANSWER_INCORRECT");
        if (spec.kind === "functions") ensure(/2\s*[,，;；]\s*[-−]\s*1/.test(answer) && /\b1\b/.test(answer) && /\b3\b/.test(answer), "FUNCTION_ANSWER_INCORRECT");
        if (spec.kind === "english") ensure(/\bB\b/.test(answer) && /\bC\b/.test(answer), "ENGLISH_ANSWER_INCORRECT");
        const confirmed = await family.request<{ status: string }>(`${spec.kind}:confirm`, `/api/v1/wrong-questions/${id}/feedback`, "POST", { feedback: "ACCURATE" });
        ensure(confirmed.data.status === "PUBLISHED", "CONFIRMATION_FAILED");
        result.status = "PUBLISHED";
        await family.request(`${spec.kind}:favorite`, `/api/v1/wrong-questions/${id}/favorite`, "POST", { favorite: true });
        await family.request(`${spec.kind}:mastered`, `/api/v1/wrong-questions/${id}/status`, "PATCH", { mastered: true });
        await family.request(`${spec.kind}:attempt`, `/api/v1/wrong-questions/${id}/attempts`, "POST", { answer: spec.correctAnswer, result: "CORRECT" });
        const { data: refreshed } = await family.request<{ wrongQuestion: Question }>(`${spec.kind}:learning-detail`, `/api/v1/wrong-questions/${id}`);
        ensure(refreshed.wrongQuestion.isFavorite && refreshed.wrongQuestion.mastered && refreshed.wrongQuestion.attempts.length === 1, "LEARNING_STATE_NOT_PERSISTED");
        ensure(refreshed.wrongQuestion.imageIds.length === images[spec.kind].length, "ORIGINAL_IMAGES_MISSING");
        await family.image(`${spec.kind}:original-image`, `/api/v1/images/${refreshed.wrongQuestion.imageIds[0]}`, false);
        await teacher.request(`${spec.kind}:teacher-detail`, `/api/v1/wrong-questions/${id}`);
        result.passed = true;
      });
    }

    await checkpoint("family:filters-and-markdown-export", async () => {
      const { data: favorites } = await family.request<{ total: number; items: { id: string }[] }>("family:favorite-list", "/api/v1/wrong-questions?favorite=true&pageSize=100");
      ensure(favorites.total === 3, "FAVORITE_FILTER_MISMATCH");
      const { data: exported } = await family.request<{ content: string; count: number; filename: string }>("family:export", "/api/v1/wrong-questions/export");
      ensure(exported.count === 3 && exported.content.length > 100 && exported.filename.endsWith(".md"), "MARKDOWN_EXPORT_FAILED");
    });

    const groups = [{ kind: "math-geometry-functions", client: teacher, sourceKinds: ["geometry", "functions"], expectImages: true }, { kind: "english-reading", client: family, sourceKinds: ["english"], expectImages: false }];
    for (const group of groups) {
      const result: PracticeResult = { kind: group.kind };
      practiceSets.push(result);
      await checkpoint(`${group.kind}:generation`, async () => {
        const selected = sources.filter((source) => group.sourceKinds.includes(source.kind) && source.status === "PUBLISHED");
        ensure(selected.length === group.sourceKinds.length, "PUBLISHED_SOURCE_MISSING");
        const { data: created } = await group.client.request<{ jobId: string }>(`${group.kind}:generate`, "/api/v1/practice-sets/generate", "POST", { studentId, wrongQuestionIds: selected.map((source) => source.id), difficulty: "MEDIUM" });
        result.jobId = created.jobId;
        const id = await waitForPractice(group.client, created.jobId, group.kind);
        result.id = id;
        result.status = "DONE";
        const { data: set } = await group.client.request<PracticeSet>(`${group.kind}:practice-detail`, `/api/v1/practice-sets/${id}`);
        result.title = set.title;
        ensure(set.questions.length === selected.length, "GENERATED_QUESTION_COUNT_MISMATCH");
        result.questions = [];
        for (const question of set.questions) {
          const detail = { id: question.id, question: question.question, answer: question.answer, explanation: question.explanation, imagePresent: Boolean(question.imageUrl), validPng: false };
          result.questions.push(detail);
          ensure(question.question.trim() && question.answer.trim() && question.explanation?.trim(), "GENERATED_CONTENT_INCOMPLETE");
          if (group.expectImages) ensure(question.imageUrl, "MATH_DIAGRAM_MISSING");
          if (question.imageUrl) detail.validPng = await group.client.image(`${group.kind}:generated-png`, question.imageUrl, true);
        }
        await family.request(`${group.kind}:family-practice-detail`, `/api/v1/practice-sets/${id}`);
        result.passed = true;
      });
    }
  } catch (error) {
    checks.push({ step: "setup-or-public-flow", passed: false, code: safeCode(error), elapsedMs: Date.now() - startedAt });
  } finally {
    if (userIds.length) await checkpoint("synthetic-accounts:disabled-and-sessions-revoked", async () => {
      const now = new Date();
      await prisma.$transaction([
        prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: false, deletedAt: now } }),
        prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.teacherStudentAssignment.updateMany({ where: { teacherId: teacherProfileId, studentId, endsAt: null }, data: { endsAt: now } }),
      ]);
    });
    await prisma.$disconnect();
    const passed = checks.every((check) => check.passed) && sources.length === 3 && sources.every((source) => source.passed) && practiceSets.length === 2 && practiceSets.every((set) => set.passed);
    await mkdir(dirname(outputPath), { recursive: true });
    // 完整资料只含本次合成题，省略所有 Cookie、手机号、密码及 OSS 签名 URL。
    await writeFile(outputPath, JSON.stringify({ testedAt: new Date().toISOString(), origin, qwenMode: "live", studentId, passed, elapsedMs: Date.now() - startedAt, checks, sources, practiceSets, requests }, null, 2), "utf8");
    const summaryRequests = [...new Set(requests.map((request) => request.step))].map((step) => {
      const values = requests.filter((request) => request.step === step);
      return { step, statuses: [...new Set(values.map((request) => request.status))], count: values.length, elapsedMs: values.reduce((sum, request) => sum + request.elapsedMs, 0) };
    });
    console.log(JSON.stringify({ passed, qwenMode: "live", studentId, sources: sources.map(({ kind, id, status, imageCount, passed: sourcePassed }) => ({ kind, id, status, imageCount, passed: sourcePassed ?? false })), practiceSets: practiceSets.map(({ kind, id, title, status, passed: setPassed, questions }) => ({ kind, id, title, status, passed: setPassed ?? false, images: questions?.map(({ imagePresent, validPng }) => ({ imagePresent, validPng })) })), checks, requests: summaryRequests, elapsedMs: Date.now() - startedAt }));
    if (!passed) process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.log(JSON.stringify({ passed: false, code: safeCode(error), elapsedMs: Date.now() - startedAt }));
  process.exitCode = 1;
});
