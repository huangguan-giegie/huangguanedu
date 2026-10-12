/**
 * LaTeX → Unicode 转换：将常见 LaTeX 数学符号/命令转换为可读的 Unicode 文本。
 * 覆盖：\frac{a}{b} → a/b，\sqrt{x} → √x，希腊字母，运算符，上下标等。
 * 用于后端存库前转换（analysis-worker + practice-set）和前端兜底显示。
 */

// ---------- 希希腊字母映射 ----------
const GREEK_MAP: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε",
  Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ",
  Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο",
  Pi: "Π", Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ",
  Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
};

// ---------- 运算符映射 ----------
const OPERATOR_MAP: Record<string, string> = {
  times: "×", div: "÷", cdot: "·", pm: "±",
  leq: "≤", geq: "≥", neq: "≠", approx: "≈", equiv: "≡",
  infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃",
  in: "∈", notin: "∉", subset: "⊂", supset: "⊃",
  cap: "∩", cup: "∪", ldots: "…", cdots: "⋯",
  leftarrow: "←", rightarrow: "→", Leftarrow: "⇐", Rightarrow: "⇒",
  leftrightarrow: "↔", Leftrightarrow: "⇔",
  prime: "′", degrees: "°",
};

// ---------- 简单替换（无嵌套） ----------
const SIMPLE_MAP: Record<string, string> = {
  ...GREEK_MAP,
  ...OPERATOR_MAP,
  space: " ",
  quad: "  ",
  ",": " ",
  ";": "; ",
  "!": "",
  ":": ": ",
  // 定界符（去掉命令，保留内容）
  left: "",
  right: "",
  big: "",
  Big: "",
  // 文本模式（去掉命令，保留内容）
  text: "",
  textit: "",
  textbf: "",
  mathrm: "",
  mathbf: "",
  mathit: "",
  operatorname: "",
  // 样式命令（去掉）
  displaystyle: "",
  textstyle: "",
  // 上划线/下划线
  overline: "",
  underline: "",
  // 根号（处理 \sqrt 无花括号的情况）
  sqrt: "√",
  cbrt: "∛",
};

/**
 * 将 LaTeX 数学文本转换为 Unicode 可读文本。
 * 支持嵌套结构（\frac{\sqrt{5}+1}{2} → (√5+1)/2）。
 */
export function latexToUnicode(text: string): string {
  if (!text || text.length === 0) return text;

  let result = text;
  result = result.replace(/\\[()[\]]/g, "").replace(/\$\$/g, "");

  // 0. 处理 $...$ 定界符（行内 LaTeX 公式）：去掉 $ 符号，保留内部内容
  // $...$ 格式：连续的 $ 包裹的公式，如 $\frac{1}{x}$ 或 $\sqrt{2}$
  result = result.replace(/\$([^$]+)\$/g, (_m, inner: string) => {
    // 对内部内容做完整 LaTeX 转换
    return latexToUnicode(inner);
  });

  // 0.5. AI 常见幻觉/OCR 错误：\rac 归一化为 \sqrt
  //    Qwen 有时把 \sqrt 写成 \rac（非标准命令），需要在 \frac/\sqrt 处理前先归一化
  result = result.replace(/\\rac\[([^\]]*)\]\{([^{}]*)\}/g, "\\sqrt[$1]{$2}");
  result = result.replace(/\\rac\{([^{}]*)\}/g, "\\sqrt{$1}");
  // 注意：不能用 \\b，因为 \rac12 中 c(字母) 和 1(数字) 同为 \w，无单词边界；
  // 用「后面不是字母」的负向断言，兼容 \rac12 / \rac 2 / \rac{ 已处理 等裸命令形态
  result = result.replace(/\\rac(?![a-zA-Z])/g, "\\sqrt");

  // 1. 处理嵌套 \frac{...}{...} → (...)/(...)
  // 递归：从最内层开始替换
  let maxIter = 20;
  while (result.includes("\\frac{") && maxIter-- > 0) {
    result = result.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, num: string, den: string) => {
      // 如果分子或分母还包含 \frac，保留外层（下一轮处理）
      if (num.includes("\\frac{") || den.includes("\\frac{")) {
        return `\\frac{${num}}{${den}}`;
      }
      return `(${num})/(${den})`;
    });
  }

  // 2. 处理 \sqrt{...} → √(...) 和 \sqrt[n]{...} → ⁿ√(...)
  result = result.replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, (_m, n: string, inner: string) => {
    return `${n}√(${inner})`;
  });
  result = result.replace(/\\sqrt\{([^{}]*)\}/g, (_m, inner: string) => {
    return `√(${inner})`;
  });
  // 根号替换完成后再次处理外层分式，支持分式与根式相互嵌套。
  for (let pass = 0; pass < 20 && /\\(?:frac|sqrt)\{/.test(result); pass += 1) {
    const before = result;
    result = result.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
    result = result.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    if (result === before) break;
  }

  // 3. 处理上标 ^{...} 和下标 _{...}
  result = result.replace(/\^\{([^{}]*)\}/g, (_m, sup: string) => {
    // 简单上标：数字/字母直接用 Unicode 上标或括号
    return sup.length <= 2 ? `^${sup}` : `^(${sup})`;
  });
  result = result.replace(/_\{([^{}]*)\}/g, (_m, sub: string) => {
    return sub.length <= 2 ? `_${sub}` : `_(${sub})`;
  });
  // 单字符上下标 ^x _x
  result = result.replace(/\^([a-zA-Z0-9])/g, (_m, c: string) => `^${c}`);
  result = result.replace(/_([a-zA-Z0-9])/g, (_m, c: string) => `_${c}`);

  // 4. 处理 \command（简单替换，无嵌套）
  result = result.replace(/\\([a-zA-Z]+)/g, (_m, cmd: string) => {
    return SIMPLE_MAP[cmd] ?? `\\${cmd}`;
  });

  // 5. 清理多余大括号（已被 \frac/\sqrt 处理后的残留）
  result = result.replace(/\{([^{}]*)\}/g, "$1");

  // 6. 清理多余空格
  result = result.replace(/\s{3,}/g, "  ");

  // 7. OCR 常见错误容错：oot→√、rac→√（AI 把 √ 识别成 oot，或输出 \rac）
  result = result.replace(/(\d*)oot(\d+)/g, (_m, num: string, inner: string) => {
    return `${num}√${inner}`;
  });
  result = result.replace(/(\d*)rac(\d+)/g, (_m, num: string, inner: string) => {
    return `${num}√${inner}`;
  });

  return result;
}
