import { describe, expect, it } from "vitest";
import { buildManimRenderCommand, buildWslCommand } from "../../src/render/manim-runner.js";

describe("Manim 渲染命令", () => {
  it("把 Windows 路径转换为 WSL 挂载路径并调用场景渲染", () => {
    expect(buildWslCommand("C:\\lessons\\scene.py", "C:\\lessons\\media")).toEqual([
      "wsl.exe",
      "--",
      "bash",
      "-lc",
      "/home/huangguan/.video-studio-venv/bin/manim -qh --format mp4 --fps 24 --resolution 1080,1920 --media_dir /mnt/c/lessons/media --output_file scene.mp4 /mnt/c/lessons/scene.py GeometryProgramScene",
    ]);
  });

  it("生成可注入的 Manim 渲染参数", () => {
    expect(buildManimRenderCommand({
      scriptPath: "C:\\runs\\scene.py",
      mediaDir: "C:\\runs\\manim",
      quality: "high",
    })).toEqual([
      "C:\\runs\\scene.py",
      "C:\\runs\\manim",
      "high",
    ]);
  });
});
