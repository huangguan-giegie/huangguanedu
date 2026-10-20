import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // 仅替换界面检查的用户响应，数学运算、导航和页面代码照常执行。
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: {
    success: true, data: { user: { id: "math-preview", role: "FAMILY", name: "数学界面检查", phoneMasked: "138****0000", mustChangePassword: false } },
  } }));
});

test("真题约束保留线段范围和两组动点解", async ({ page }) => {
  await page.goto("/geometry-lab");
  await expect(page.getByRole("heading", { name: "正方形中的相似与定值", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "数学实验室统一导航" }).getByRole("link")).toHaveCount(6);
  await page.getByRole("button", { name: "观察 H 超出线段", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "H 已超出线段 DF" })).toBeVisible();
  await page.getByRole("button", { name: /2025 武汉中考.*第24题/ }).click();
  await page.getByRole("button", { name: "第（2）问：x=6−4√3", exact: true }).click();
  await page.getByRole("button", { name: "查看本问答案与推导", exact: true }).click();
  await expect(page.getByText("xP=2 或 6−4√3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "第（3）问：面积比 3/4", exact: true }).click();
  await expect(page.getByLabel("原题约束检查").locator("li[data-pass=false]")).toHaveCount(0);
});

test("真题函数带入统一工具，连续变换保留原函数基准", async ({ page }) => {
  await page.goto("/geometry-lab");
  await page.getByRole("button", { name: /2025 武汉中考.*第24题/ }).click();
  await page.getByRole("link", { name: "打开当前函数 →", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "函数表达式", exact: true })).toHaveValue("x^2/4-3");
  await page.getByRole("slider", { name: /纵向伸缩 A/ }).fill("2");
  await page.getByRole("slider", { name: /横向频率 ω/ }).fill("3");
  await expect(page.getByText("与 y 轴交点：(0, -6.000)", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "符号代数 CAS", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /符号计算 精确代数/ }).click();
  await expect(page.getByRole("heading", { name: "符号代数 CAS", exact: true })).toBeVisible();
});
