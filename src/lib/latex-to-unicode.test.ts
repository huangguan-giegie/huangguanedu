import { describe, expect, it } from "vitest";

import {
  flattenCases,
  latexToUnicode,
  normalizeGeometryText,
  repairLeadingAngleSymbols,
  unconvertedCommands,
} from "./latex-to-unicode";

describe("LaTeX → Unicode 几何符号", () => {
  it("几何关系符不再以原始 LaTeX 形式漏给学生", () => {
    expect(latexToUnicode(String.raw`AB\parallel CD`)).toBe("AB∥CD");
    expect(latexToUnicode(String.raw`CD\perp AB`)).toBe("CD⊥AB");
    expect(latexToUnicode(String.raw`\angle ACB`)).toBe("∠ACB");
    expect(latexToUnicode(String.raw`AB\nparallel CD`)).toBe("AB∦CD");
    expect(latexToUnicode(String.raw`\not\parallel`)).toBe("∦");
  });

  it("图形与全等相似符号", () => {
    expect(latexToUnicode(String.raw`\triangle ABC \cong \triangle DEF`)).toBe("△ABC≅△DEF");
    expect(latexToUnicode(String.raw`\square ABCD`)).toBe("□ABCD");
    expect(latexToUnicode(String.raw`\odot O`)).toBe("⊙O");
    expect(latexToUnicode(String.raw`AB \sim CD`)).toBe("AB∼CD");
    // 关系符（= ≠ ≤ 等）本身的空格刻意保留，方便阅读；几何符号两侧则一律收紧
    expect(latexToUnicode(String.raw`\therefore \angle A \neq \angle B`)).toBe("∴∠A ≠∠B");
  });

  it("角度记号：^\circ 必须转成度符号，不能变成上标 °", () => {
    expect(latexToUnicode(String.raw`90^\circ`)).toBe("90°");
    expect(latexToUnicode(String.raw`90^{\circ}`)).toBe("90°");
    expect(latexToUnicode(String.raw`\angle BAD = 90^\circ`)).toBe("∠BAD = 90°");
  });

  it("向量：组合箭头跟在参数之后", () => {
    const out = latexToUnicode(String.raw`2\vec{CD} + \overrightarrow{AB}`);
    expect(Array.from(out)).toEqual(["2", "C", "D", "\u20D7", " ", "+", " ", "A", "B", "\u20D7"]);
  });

  it("行内 $...$ 内的几何命令同样转换", () => {
    expect(latexToUnicode(String.raw`$AB \parallel CD$ 且 $\angle A = 60^\circ$`)).toBe("AB∥CD 且∠A = 60°");
  });

  it("已是 Unicode 的几何符号原样保留，仅统一两侧空格", () => {
    const out = latexToUnicode("AB ∥ CD，CD ⊥ AB，∠ACB = 90°");
    expect(out).toBe("AB∥CD，CD⊥AB，∠ACB = 90°");
    // 幂等：再转一次结果不变
    expect(latexToUnicode(out)).toBe(out);
  });

  it("原有分式/根式/上下标行为不回归", () => {
    expect(latexToUnicode(String.raw`\(\frac{\sqrt{5}+1}{2}\)`)).toBe("(√(5)+1)/(2)");
    expect(latexToUnicode(String.raw`\[y=x^{2}-2x+1\]`)).toBe("y=x^2-2x+1");
    expect(latexToUnicode(String.raw`x \leq 3`)).toBe("x ≤ 3");
  });

  it("残留命令可被检出，供线上告警定位缺项", () => {
    expect(unconvertedCommands(String.raw`\dfrac{1}{2} 与 \parallel`)).toEqual(["dfrac", "parallel"]);
    expect(unconvertedCommands(latexToUnicode(String.raw`AB\parallel CD \angle A`))).toEqual([]);
  });
});

describe("ASCII 近似几何符号归一", () => {
  it("把 // 与 || 统一成平行号", () => {
    expect(latexToUnicode("且 DE // BC")).toBe("且 DE∥BC");
    expect(latexToUnicode("AB||CD")).toBe("AB∥CD");
  });

  it("把三角形之间的 ~ 统一成相似号", () => {
    expect(latexToUnicode("求证：△ADE ~ △ABC")).toBe("求证：△ADE∽△ABC");
  });

  it("不误伤链接与普通波浪号", () => {
    expect(latexToUnicode("参考 https://a.cn/x")).toBe("参考 https://a.cn/x");
    expect(latexToUnicode("取值范围 1~5")).toBe("取值范围 1~5");
  });

  it("标准符号保持幂等", () => {
    const text = "DE∥BC，CD⊥AB，△ADE∽△ABC";
    expect(latexToUnicode(latexToUnicode(text))).toBe(text);
  });
});

describe("单字母角与左侧角补齐（第三轮线上实例）", () => {
  it("「A = 70°」补成「∠A = 70°」，小写变量不动", () => {
    expect(repairLeadingAngleSymbols("在△ABC 中，A = 70°，∠ABC = 50°")).toBe("在△ABC 中，∠A = 70°，∠ABC = 50°");
    expect(repairLeadingAngleSymbols("x = 90°，y = 45°")).toBe("x = 90°，y = 45°");
  });
  it("「F =∠ACB」左侧补 ∠", () => {
    expect(repairLeadingAngleSymbols("∴F =∠ACB = 60°")).toBe("∴∠F =∠ACB = 60°");
    expect(repairLeadingAngleSymbols("∴∠F =∠ACB")).toBe("∴∠F =∠ACB");
  });
  it("线段长度与双字母赋值不受影响", () => {
    expect(repairLeadingAngleSymbols("AB = 2.5，BC = 0.7，AC = 6")).toBe("AB = 2.5，BC = 0.7，AC = 6");
  });
});

describe("算式中间的单字母角（第三轮线上实例）", () => {
  it("「180° - B -∠ACB」补成「180° - ∠B -∠ACB」", () => {
    expect(repairLeadingAngleSymbols("∠BAC = 180° - B -∠ACB")).toBe("∠BAC = 180° - ∠B -∠ACB");
  });
  it("括号内、单个运算符旁的单字母不动", () => {
    expect(repairLeadingAngleSymbols("(A - B) 两点间距离")).toBe("(A - B) 两点间距离");
    expect(repairLeadingAngleSymbols("2x - B")).toBe("2x - B");
  });
});

describe("cases 环境展平（第三轮线上实例：\\begincases 泄漏）", () => {
  it("三元组条件组展平为带圈序号", () => {
    expect(flattenCases(String.raw`在△ABC 和△DEF 中 \begin{cases} AB = DE \\ AC = DF \\ BC = EF \end{cases}；`))
      .toBe("在△ABC 和△DEF 中 ：① AB = DE；② AC = DF；③ BC = EF；");
  });
  it("兼容带 & 的对齐写法", () => {
    expect(flattenCases(String.raw`\begin{cases} x=1 \\ y=2 \end{cases}`))
      .toBe("：① x=1；② y=2");
  });
  it("单行 cases 只留冒号", () => {
    expect(flattenCases(String.raw`\begin{cases} x=1 \end{cases}`)).toBe("：x=1");
  });
  it("无 cases 时原样返回", () => {
    expect(flattenCases("AB = DE，AC = DF")).toBe("AB = DE，AC = DF");
  });
  it("normalizeGeometryText 已包含 cases 展平", () => {
    expect(normalizeGeometryText(String.raw`∵\begin{cases} a \\ b \end{cases}`)).not.toContain("\\begin");
  });
});
