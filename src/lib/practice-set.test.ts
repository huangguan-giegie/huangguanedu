import { afterEach, describe, expect, it, vi } from "vitest";
import { alignAnswerWithExplanation, generatePracticeSetAi, persistQuestions, renderDiagramSvg, sanitizeDiagramSvg, sanitizeGeneratedText } from "./practice-set";
import { latexToUnicode } from "./latex-to-unicode";

const save = vi.fn(async (_buffer: Buffer, _options: { extension: string; subdir?: string }) => "practice-diagrams/test.png");
const remove = vi.fn(async () => {});
vi.mock("./storage", () => ({ getStorage: () => ({ save, delete: remove, getReadUrl: async () => null }) }));
const input = { grade: "初二", difficulty: "MEDIUM" as const, wrongQuestions: [{ subject: "ENGLISH" as const, recognizedQuestion: "He ___ to school yesterday. A.go B.went C.goes", knowledgePoints: ["一般过去时"], remedialPractice: [], finalAnswer: "B", correctSteps: ["yesterday对应一般过去时"] }] };

describe("模拟题迁移", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("异步出题使用精确图形参数覆盖模型编造的题面与答案", async () => {
    vi.stubEnv("QWEN_MODE", "live"); vi.stubEnv("DASHSCOPE_API_KEY", "test"); vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.test/v1");
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "圆的练习", questions: [{ question: "错误题面", answer: "999", explanation: "错误解析", diagram: { type: "circle_sector", radius: 6, centralAngle: 60, task: "ARC_LENGTH" } }],
    }) } }] })));
    const output = await generatePracticeSetAi(input, request as unknown as typeof fetch);
    expect(output.questions[0].answer).toBe("2π cm");
    expect(output.questions[0].question).not.toBe("错误题面");
    const persisted = await persistQuestions(output);
    expect(persisted.questions[0]).toMatchObject({ answer: "2π cm", diagram: { type: "circle_sector" }, imagePath: null });
    expect(persisted.diagramFailures).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("精确图形参数无效时拒绝进入异步生成任务", async () => {
    vi.stubEnv("QWEN_MODE", "live"); vi.stubEnv("DASHSCOPE_API_KEY", "test"); vi.stubEnv("DASHSCOPE_BASE_URL", "https://example.test/v1");
    const request = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "错误图形", questions: [{ question: "q", answer: "a", explanation: "e", diagram: { type: "circle_sector", radius: -1, centralAngle: 60, task: "ARC_LENGTH" } }] }) } }] }));
    await expect(generatePracticeSetAi(input, request)).rejects.toThrow("数量或格式不完整");
  });
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
      expect(result.questions[0].imagePath).toBe("practice-diagrams/test.png");
      expect(result.diagramFailures).toEqual([]);
    }
    expect(save).toHaveBeenCalledTimes(4);
    expect(save.mock.calls[0][0]).toBeInstanceOf(Buffer);
  }, 20000);
  it("带垂足/交点/折叠像点的中考几何题能出图，不再整卷失败", async () => {
    // 直角三角形 + 斜边垂足 D + 中线交点 E，共 5 个顶点，旧 schema 只允许 3 个。
    const diagramDescription = {
      shapeType: "single-triangle",
      vertices: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D", on: ["A", "B"], ratio: 0.6 }, { label: "E", on: ["A", "C"], ratio: 0.5 }],
      polygons: [["A", "B", "C"]],
      segments: [{ from: "C", to: "D" }, { from: "B", to: "E", dashed: true }],
    };
    const result = await persistQuestions({ title: "题组", questions: [{ question: "Rt△ABC中，CD⊥AB于D，BE平分∠ABC交AC于E，求∠BEC。", answer: "1", explanation: "步骤", diagramDescription }] });
    expect(result.diagramFailures).toEqual([]);
    expect(result.questions[0].imagePath).toBe("practice-diagrams/test.png");
  }, 20000);
  it("题目引用无法提供的图形时降级为无图并上报题号，不静默落库也不整卷失败", async () => {
    const missing = await persistQuestions({ title: "题组", questions: [{ question: "如图求解", answer: "1", explanation: "步骤", diagramDescription: null }] });
    expect(missing.diagramFailures).toEqual([1]);
    expect(missing.questions[0].imagePath).toBeNull();
    const broken = await persistQuestions({ title: "题组", questions: [{ question: "求值", answer: "1", explanation: "步骤", diagramDescription: { shapeType: "function-graph", vertices: [], functions: [{ expr: "globalThis.process.exit()" }] } }] });
    expect(broken.diagramFailures).toEqual([1]);
  });
  it("无图模式忽略模型仍带回的图形结构，只校验题干是否自足", async () => {
    const selfContained = await persistQuestions({ title: "题组", questions: [{ question: "在△ABC中，AB=3，BC=4，AC=5，求△ABC的面积。", answer: "6", explanation: "步骤", diagramDescription: { shapeType: "single-triangle", vertices: [{ label: "A" }, { label: "B" }, { label: "C" }] } }] }, { diagrams: false });
    expect(selfContained.diagramFailures).toEqual([]);
    expect(selfContained.questions[0].imagePath).toBeNull();
    expect(save).not.toHaveBeenCalled();
    const stillReferenced = await persistQuestions({ title: "题组", questions: [{ question: "如图求解", answer: "1", explanation: "步骤", diagramDescription: null }] }, { diagrams: false });
    expect(stillReferenced.diagramFailures).toEqual([1]);
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

// ---------- R2-01：解析泄漏清洗与答案一致性（第二轮线上实例回归） ----------

describe("R2-01 解析泄漏与答案一致性", () => {
  it("剥离模型自审段落，保留干净解析与最终数值", () => {
    const leaked = [
      "由折叠性质可知：∠EBD =∠CBD；所以 BE = DE；设 BE = x，则 DE = x，AE = 6 - x；在 Rt△ABE 中，8^2 + (6 - x)^2 = x^2 ⇒ x = (25)/(3)。",
      "**修正解析**：原题数据 AB=6, BC=8 导致 AD=8。",
      "重新计算：设 BE=x，则 DE=x，AE=6-x。",
      "**再次检查题目意图**：通常此类题保持整数解或常见分数。",
      "**等等，让我重新审视原题2的变式策略**：",
      "这个答案是正确的。",
    ].join("\n\n");
    const clean = sanitizeGeneratedText(leaked);
    expect(clean).not.toContain("修正解析");
    expect(clean).not.toContain("重新审视");
    expect(clean).not.toContain("再次检查");
    expect(clean).not.toContain("重新计算");
    expect(clean).toContain("x = (25)/(3)");
    expect(clean).not.toContain("**");
  });

  it("乘号星号不被当成 Markdown 强调吃掉", () => {
    expect(sanitizeGeneratedText("面积 = 2 * 3 * 4")).toContain("2 * 3 * 4");
    expect(sanitizeGeneratedText("**关键**步骤")).toBe("关键步骤");
  });

  it("答案与解析一致时原样保留（含分数形态）", () => {
    expect(alignAnswerWithExplanation("6", "解得：CD = 6（舍去负值）。")).toBe("6");
    expect(alignAnswerWithExplanation("25/4", "解得 x = 25/4。")).toBe("25/4");
    expect(alignAnswerWithExplanation("12", "即 (3)/(9) = (4)/(BC)，解得 BC = 12。")).toBe("12");
  });

  it("参考答案（原题值）与解析（变式值）矛盾时按解析回填", () => {
    const explanation = "设 BE = x，则 DE = x，AE = 6 - x。64 + 36 - 12x + x^2 = x^2 ⇒ 100 = 12x ⇒ x = (25)/(3)。";
    expect(alignAnswerWithExplanation("25/4", explanation)).toBe("(25)/(3)");
  });

  it("带根号或双字母的答案跳过校验，不误伤", () => {
    expect(alignAnswerWithExplanation("2√13", "CD = 6。")).toBe("2√13");
    expect(alignAnswerWithExplanation("BC = 9", "BC = 9。")).toBe("BC = 9");
    expect(alignAnswerWithExplanation("x = 3 或 x = -7", "x = 3。")).toBe("x = 3 或 x = -7");
  });

  it("分步拼接的连用标点被折叠", () => {
    const cleaned = sanitizeGeneratedText("两个三角形相似）。；(2) 解：∵DE∥BC，∴∠ADE =∠ABC。");
    expect(cleaned).not.toContain("。；");
    expect(cleaned).toContain("相似）。");
  });
});
