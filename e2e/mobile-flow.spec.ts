import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const FAMILY_PHONE = "13800000003";
const TEMP_PASSWORD = "Temp@123456";
const NEW_PASSWORD = "Test@1234567";

// 处理待执行的分析任务（Mock 分析即时完成）
function processAnalysis() {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.E2E_DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:55432/yy_e2e",
  };
  execFileSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "scripts/analysis-process.ts",
    ],
    { env, stdio: "pipe" },
  );
}

test("移动端核心流程：登录->改密->首页->预约->上传错题->确认识别->查看解答", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // 1. 登录
  await page.goto("/login");
  await page.getByPlaceholder("请输入手机号").fill(FAMILY_PHONE);
  await page.getByPlaceholder("请输入密码").fill(TEMP_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();

  // 2. 首次登录强制改密
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel("旧密码").fill(TEMP_PASSWORD);
  await page.getByLabel(/新密码/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "确认修改" }).click();

  // 3. 学生首页
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("欢迎");
  await expect(page.getByText("月卡包含周一至周四线下小班课")).toBeVisible();

  // 4. 预约课程（周末一对一）
  await page.getByRole("link", { name: /预约课程/ }).click();
  await expect(page).toHaveURL(/\/bookings/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("预约课程");
  const bookButton = page.getByRole("button", { name: "预约" }).first();
  if ((await bookButton.count()) > 0) {
    await bookButton.click();
    await expect(page.getByText("预约成功，等待老师确认")).toBeVisible();
  }

  // 5. 上传错题
  await page.goto("/wrong-questions/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("上传错题");
  await page.getByLabel("学科").selectOption("MATH");
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "question.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "上传并分析" }).click();

  // 6. 等待分析完成（执行 worker）
  await expect(page).toHaveURL(/\/wrong-questions\/[a-z0-9]+/);
  await page.waitForTimeout(1500);
  processAnalysis();

  // 7. 详情页出现确认识别提示
  await expect(page.getByText("题目和你的解题过程识别准确吗")).toBeVisible({
    timeout: 15_000,
  });

  // 8. 学生确认识别准确 -> 直接发布完整解答
  await page.getByRole("button", { name: "识别准确" }).click();
  await expect(page.getByText("AI 初步生成")).toBeVisible();
  await expect(page.getByText("完整解答")).toBeVisible();
  await expect(page.getByText(/答案：x = 4/)).toBeVisible();
});
