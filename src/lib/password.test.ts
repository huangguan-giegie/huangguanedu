import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("密码哈希工具", () => {
  it("哈希后的密码可以被正确验证", async () => {
    const plain = "Temp@123456";
    const stored = await hashPassword(plain);

    expect(stored).toMatch(/^scrypt:/);
    await expect(verifyPassword(plain, stored)).resolves.toBe(true);
  });

  it("错误密码验证不通过", async () => {
    const stored = await hashPassword("Correct@123");

    await expect(verifyPassword("Wrong@456", stored)).resolves.toBe(false);
  });

  it("相同密码每次生成不同的盐和哈希", async () => {
    const plain = "Temp@123456";
    const first = await hashPassword(plain);
    const second = await hashPassword(plain);

    expect(first).not.toBe(second);
  });

  it("格式损坏的存储值验证不通过", async () => {
    await expect(verifyPassword("Temp@123456", "not-a-valid-format")).resolves.toBe(false);
  });
});
