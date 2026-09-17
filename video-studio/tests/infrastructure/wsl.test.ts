import { describe, expect, it } from "vitest";
import { buildWslSetupCommand, normalizeWslPath } from "../../src/infrastructure/wsl.js";

describe("WSL 环境桥接", () => {
  it("把 Windows 路径转换为 /mnt 驱动器路径", () => {
    expect(normalizeWslPath("D:\\video-studio\\runs")).toBe("/mnt/d/video-studio/runs");
  });

  it("生成一次性视频环境安装命令", () => {
    expect(buildWslSetupCommand()).toContain("sudo apt-get install");
    expect(buildWslSetupCommand()).toContain("manim");
    expect(buildWslSetupCommand()).toContain("libreoffice");
  });
});
