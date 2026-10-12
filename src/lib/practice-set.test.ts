import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePracticeSetAi, persistQuestions, renderDiagramSvg, sanitizeDiagramSvg } from "./practice-set";
import { latexToUnicode } from "./latex-to-unicode";

const save = vi.fn(async (_buffer: Buffer, _options: { extension: string; subdir?: string }) => "practice-diagrams/test.png");
const remove = vi.fn(async () => {});
vi.mock("./storage", () => ({ getStorage: () => ({ save, delete: remove, getReadUrl: async () => null }) }));
const input = { grade: "初二", difficulty: "MEDIUM" as const, wrongQuestions: [{ subject: "ENGLISH" as const, recognizedQuestion: "He ___ to school yesterday. A.go B.went C.goes", knowledgePoints: ["一般过去时"], remedialPractice: [], finalAnswer: "B", correctSteps: ["yesterday对应一般过去时"] }] };

describe("模拟题迁移", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("英语实时请求保留考点和难度，提示不包含学生身份字段", async () => {
    vi.stubEnv("QWEN_MODE", "live"); vi.stubEnv("DASHSCOPE_API_KEY", "test"); vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.test/v1");
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain("英语"); expect(body).toContain("一般过去时"); expect(body).toContain("MEDIUM"); expect(body).not.toContain("学生姓名：");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "过去时变式", questions: [{ question: "She ___ her homework last night. A.do B.did C.does", answer: "B", explanation: "last night用一般过去时" }] }) } }] }));
    });
    expect((await generatePracticeSetAi(input, request as unknown as typeof fetch)).questions[0].answer).toBe("B");
  });
  it("不接受与选择错题数不一致的AI结果", async () => {
    vi.stubEnv("QWEN_MODE", "live"); vi.stubEnv("DASHSCOPE_API_KEY", "test"); vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.test/v1");
    const request = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "错误数量", questions: [1, 2].map(() => ({ question: "q", answer: "a", explanation: "e" })) }) } }] }));
    await expect(generatePracticeSetAi(input, request)).rejects.toThrow("数量或格式不完整");
  });
  it("结构化一次/二次/反比例函数与几何图都能渲染PNG并保存", async () => {
    for (const diagramDescription of [
      { shapeType: "single-triangle", vertices: [{ label: "A" }, { label: "B" }, { label: "C" }] },
      ...["y=2x+1", "y=x^2-2x+1", "y=\\frac{2}{x}"].map((expr) => ({ shapeType: "function-graph", vertices: [], functions: [{ expr, domain: [-5, 5] }] })),
    ]) {
      const result = await persistQuestions({ title: "题组", questions: [{ question: "如图求解", answer: "1", explanation: "步骤", diagramDescription }] });
      expect(result[0].imagePath).toBe("practice-diagrams/test.png");
    }
    expect(save).toHaveBeenCalledTimes(4);
    expect(save.mock.calls[0][0]).toBeInstanceOf(Buffer);
  }, 20000);
  it("题目引用缺失图片时明确失败，不静默落库", async () => {
    await expect(persistQuestions({ title: "题组", questions: [{ question: "如图求解", answer: "1", explanation: "步骤", diagramDescription: null }] })).rejects.toThrow("未提供图片");
    await expect(persistQuestions({ title: "题组", questions: [{ question: "求值", answer: "1", explanation: "步骤", diagramDescription: { shapeType: "function-graph", vertices: [], functions: [{ expr: "globalThis.process.exit()" }] } }] })).rejects.toThrow("绘制失败");
  });
  it("拒绝SVG外链、脚本、实体与事件，基本SVG可安全渲染", async () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><line x1="20" y1="20" x2="100" y2="100" stroke="#39323f"/></svg>';
    const png = await renderDiagramSvg(safe); expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
    for (const unsafe of ['<script>alert(1)</script>', '<image href="file:///etc/passwd"/>', '<rect onload="evil()"/>', '<rect fill="url(http://evil)"/>', '<foreignObject/>']) expect(() => sanitizeDiagramSvg(safe.replace("</svg>", `${unsafe}</svg>`))).toThrow();
  });
  it("嵌套根式/分式与公式定界符可读", () => {
    expect(latexToUnicode("\\(\\frac{\\sqrt{5}+1}{2}\\)")).toBe("(√(5)+1)/(2)");
    expect(latexToUnicode("\\[y=x^{2}-2x+1\\]")).toBe("y=x^2-2x+1");
  });
});
