import { describe, expect, it } from "vitest";
import {
  createDocumentSource,
  identifyDocumentKind,
  readDocumentSource,
  scanDocumentSources,
  type CommandRunner,
} from "../../src/document/source.js";

describe("文档来源识别与读取", () => {
  it("识别文本、图片、文档和 PDF 扩展名", () => {
    expect(identifyDocumentKind("教案.txt")).toBe("text");
    expect(identifyDocumentKind("题目.PNG")).toBe("image");
    expect(identifyDocumentKind("知识讲解.doc")).toBe("doc");
    expect(identifyDocumentKind("知识讲解.docx")).toBe("docx");
    expect(identifyDocumentKind("试卷.pdf")).toBe("pdf");
    expect(identifyDocumentKind("参考视频.mp4")).toBeNull();
  });

  it("扫描目录时递归收集输入并排除 mp4 与不支持格式", async () => {
    const sources = await scanDocumentSources("C:/templates", {
      listFiles: async () => [
        "C:/templates/a.doc",
        "C:/templates/sub/b.png",
        "C:/templates/reference.mp4",
        "C:/templates/notes.html",
      ],
    });
    expect(sources.map((source) => source.path)).toEqual([
      "C:/templates/a.doc",
      "C:/templates/sub/b.png",
    ]);
  });

  it("读取文本与图片输入为统一分页结构", async () => {
    const text = await readDocumentSource("C:/lesson.txt", {
      readFile: async () => "第一行\n第二行",
    });
    expect(text.pages).toEqual([{ pageNumber: 1, text: "第一行\n第二行", assets: [] }]);

    const image = await readDocumentSource("C:/question.jpg", {
      readFile: async () => new Uint8Array([1, 2, 3]),
    });
    expect(image.pages[0]?.assets[0]).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
    expect(image.pages[0]?.assets[0]?.dataUrl).toBe("data:image/jpeg;base64,AQID");
  });

  it("通过可注入命令执行器读取 docx/pdf 转换文本", async () => {
    const calls: string[] = [];
    const commandRunner: CommandRunner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      return { exitCode: 0, stdout: "题目：证明三角形全等\n条件：两边及其夹角", stderr: "" };
    };
    const source = await readDocumentSource("C:/lesson.docx", { commandRunner });
    expect(source.pages[0]?.text).toContain("证明三角形全等");
    expect(calls[0]).toContain("/mnt/c/lesson.docx");
  });

  it("Windows 无 WSL 时返回可操作的中文错误", async () => {
    await expect(
      readDocumentSource("C:/lesson.doc", { platform: "win32", commandRunner: undefined, wslAvailable: false }),
    ).rejects.toThrow("当前 Windows 未检测到可用 WSL");
  });

  it("创建来源时保留稳定 id 与扩展名", () => {
    expect(createDocumentSource("C:/教案/知识讲解.doc")).toMatchObject({
      id: "知识讲解",
      path: "C:/教案/知识讲解.doc",
      kind: "doc",
      extension: ".doc",
    });
  });
});
