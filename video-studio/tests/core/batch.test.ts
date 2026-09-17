import { describe, expect, it } from "vitest";
import { discoverSourceFiles, createBatchPaths } from "../../src/core/batch.js";

describe("教案批次", () => {
  it("扫描目录时只保留教案、题目图片和 PDF，不把 MP4 当作输入", async () => {
    const files = await discoverSourceFiles("C:/lessons", async () => [
      "C:/lessons/知识讲解.doc",
      "C:/lessons/巩固练习.doc",
      "C:/lessons/题目.png",
      "C:/lessons/风格参考.mp4",
      "C:/lessons/README.txt",
    ]);

    expect(files).toEqual([
      "C:\\lessons\\巩固练习.doc",
      "C:\\lessons\\题目.png",
      "C:\\lessons\\知识讲解.doc",
      "C:\\lessons\\README.txt",
    ]);
  });

  it("为批次创建分层输出路径", () => {
    expect(createBatchPaths("C:/runs", "geometry-series")).toMatchObject({
      root: "C:\\runs\\geometry-series",
      manifest: "C:\\runs\\geometry-series\\manifest.json",
      lessonMap: "C:\\runs\\geometry-series\\lesson-map.json",
      sourceText: "C:\\runs\\geometry-series\\source\\extracted-text.json",
      videos: "C:\\runs\\geometry-series\\videos",
    });
  });
});
