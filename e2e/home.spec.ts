import { expect, test } from "@playwright/test";

// 登录页 E2E 冒烟测试
test("登录页显示项目名称", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "黄冠AI Academy",
  );
});
