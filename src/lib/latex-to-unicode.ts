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
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓",
  leq: "≤", geq: "≥", neq: "≠", ne: "≠", approx: "≈", approxeq: "≊", equiv: "≡",
  ll: "≪", gg: "≫", propto: "∝",
  infty: "∞", partial: "∂", nabla: "∇", forall: "∀", exists: "∃",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇",
  subsetneq: "⊊", supsetneq: "⊋", emptyset: "∅", varnothing: "∅",
  cap: "∩", cup: "∪", wedge: "∧", land: "∧", vee: "∨", lor: "∨", neg: "¬", lnot: "¬",
  oplus: "⊕", ominus: "⊖", otimes: "⊗", ast: "∗", star: "⋆", bullet: "•",
  ldots: "…", cdots: "⋯", dots: "…", vdots: "⋮", ddots: "⋱",
  leftarrow: "←", rightarrow: "→", Leftarrow: "⇐", Rightarrow: "⇒",
  leftrightarrow: "↔", Leftrightarrow: "⇔",
  to: "→", gets: "←", mapsto: "↦", implies: "⟹", iff: "⟺",
  longrightarrow: "⟶", longleftarrow: "⟵", Longrightarrow: "⟹", Longleftarrow: "⟸",
  hookrightarrow: "↪",
  prime: "′", degrees: "°", degree: "°",
  // ---- 几何关系与图形（中考几何高频；缺这些时学生看到的会是原始 LaTeX）----
  parallel: "∥", nparallel: "∦", perp: "⊥", angle: "∠", measuredangle: "∡",
  triangle: "△", bigtriangleup: "△", square: "□", Box: "□",
  rectangle: "▭", parallelogram: "▱", rhombus: "◇",
  odot: "⊙", bigcirc: "◯", circ: "°",
  cong: "≅", ncong: "≇", sim: "∼", backsim: "∽", simeq: "≃",
  therefore: "∴", because: "∵",
  // ---- 向量修饰：真正的组合箭头由 VECTOR_DECORATION 预处理加上，这里只兜底裸命令 ----
  vec: "", overrightarrow: "", overleftarrow: "",
};

/** 向量/有向线段的组合箭头（必须跟在参数之后才能正确叠加） */
const VECTOR_DECORATION: Record<string, string> = {
  vec: "\u20D7",        // ⃗ 组合右箭头
  overrightarrow: "\u20D7",
  overleftarrow: "\u20D6", // ⃖ 组合左箭头
};

/** \not 与后续命令组合出的否定关系符 */
const NEGATED_MAP: Record<string, string> = {
  "=": "≠", neq: "≠", ne: "≠", equiv: "≢", in: "∉", ni: "∌",
  parallel: "∦", subset: "⊄", supset: "⊅", subseteq: "⊈", supseteq: "⊉",
  sim: "≁", approx: "≉", cong: "≇", exists: "∄",
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

  // 0.6. 几何题专用：\not 与后一个命令组合成否定关系符（\not\parallel → ∦）
  result = result.replace(/\\(?:not|n)\s*\\?([a-zA-Z=]+)/g, (match, cmd: string) => NEGATED_MAP[cmd] ?? match);

  // 0.7. 角度记号：90^\circ / 90^{\circ} 必须在这里转成 90°，否则会先被当成上标变成 90^°
  result = result.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°");
  result = result.replace(/\\degree(?:s)?(?![a-zA-Z])/g, "°");

  // 0.8. 向量/有向线段：\vec{CD} → CD⃗（组合箭头必须跟在参数后面）
  for (const [cmd, arrow] of Object.entries(VECTOR_DECORATION)) {
    result = result.replace(new RegExp(`\\\\${cmd}\\s*\\{([^{}]*)\\}`, "g"), (_m, inner: string) => `${inner}${arrow}`);
  }
  result = result.replace(/\\(vec|overrightarrow|overleftarrow)(?![a-zA-Z])/g, "");

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

  // 5.4. 模型偶尔用 ASCII 近似符代替几何符号（DE // BC、AB||CD、△ADE ~ △ABC），
  //      统一成教科书符号。只在两侧确实是点名/三角形记号时替换，不会误伤 https:// 这类链接
  //      （链接里 // 前面紧跟的是冒号，点名里不会出现）。
  result = result.replace(/(?<![:/\w])([A-Za-z][A-Za-z0-9′']{0,2})\s*(?:\/\/|\|\|)\s*(?=[A-Za-z])/g, "$1∥");
  result = result.replace(/(△[^，。；、\s]*)\s*~\s*(?=△)/g, "$1∽");
  // 模型会直接输出 U+223C（∼，数学波浪号）当相似号，与题干的 U+223D（∽）不一致；
  // 同样只认「两侧都是三角形记号」的形态，避免误伤「∼50%」这类约等写法。
  result = result.replace(/(△[^，。；、\s]*)\s*∼\s*(?=△)/g, "$1∽");

  // 5.5. 几何符号两侧的空格是排版噪音（\parallel 命令后自带、AI 书写习惯各异），
  //      统一去掉，得到教科书写法：AB ∥ CD → AB∥CD，在 △ABC 中 → 在△ABC中
  result = result.replace(/\s*([∥∦⊥∠∡△□▭▱◇⊙◯∼∽≃≅≇∴∵])\s*/g, "$1");

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

/**
 * 找出转换后仍残留的 LaTeX 命令（如 \dfrac、\begin）。
 * 学生看到的文本不该出现反斜杠命令，残留即说明映射表缺项，用于线上告警定位。
 */
export function unconvertedCommands(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\\([a-zA-Z]+)/g), (match) => match[1])));
}

/**
 * 展平 LaTeX 的 cases 环境（条件组）。
 *
 * 模型在写「在△ABC 和△DEF 中」这类条件罗列时会输出
 * `\begin{cases} AB = DE \\ AC = DF \\ BC = EF \end{cases}`，
 * 而 latexToUnicode 的映射表里没有 cases，反斜杠命令原样漏给学生看
 * （线上实测出现过 `\begincases ... \endcases`，连反斜杠都被吃掉）。
 *
 * 展平为「：① AB = DE；② AC = DF；③ BC = EF」，条件数量不定。
 * 行内写法 `\begin{cases} a \\ b \end{cases}` 与带 `&` 的对齐写法都要兼容。
 */
export function flattenCases(text: string): string {
  return text.replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
    (_m, body: string) => {
      const rows = body
        .split(/\\\\/)
        .map((row) => row.replace(/&/g, "").trim())
        .filter(Boolean);
      if (!rows.length) return "";
      if (rows.length === 1) return `：${rows[0]}`;
      const circled = "①②③④⑤⑥⑦⑧⑨⑩";
      const parts = rows.map(
        (row, index) => `${circled[index] ?? `${index + 1}.`} ${row}`,
      );
      return `：${parts.join("；")}`;
    },
  );
}

/**
 * 折叠分步生成文本里的连用标点。
 *
 * 出题/解析按步骤生成再拼接，接缝处会出现「）。；」「；。」这类成对标点，
 * 学生读起来像排版事故。只折叠同类终止性标点，不动列举用的「；」和括号。
 */
export function tidyPunctuation(text: string): string {
  return text
    .replace(/。\s*；/g, "。")
    .replace(/；\s*。/g, "。")
    .replace(/！\s*；/g, "！")
    .replace(/？\s*；/g, "？")
    .replace(/。{2,}/g, "。")
    .replace(/；{2,}/g, "；");
}


// ---------- 几何符号机械修复（识别侧与出题侧共用） ----------
// 识别与出题的模型是同一族，犯的错也一样：ASCII 近似符、∼/∽ 混用、
// 等号两侧丢 ∠。修一次、两侧都生效，避免出题解析里再次出现「∠F = ACB」。

const LETTER_TOKEN = String.raw`[A-Za-z][A-Za-z0-9'′₁₂₃₄]{0,3}`;

/** 修复「用 ASCII 近似符号代替标准符号」的写法（//、||、~、∼），不碰普通文本。 */
export function repairGeometrySymbols(text: string): string {
  let out = text;
  // 平行：DE // BC、AB||CD → DE∥BC（链接里的 // 前面是冒号，点名不会出现，不会误伤）
  out = out.replace(
    new RegExp(String.raw`(${LETTER_TOKEN})\s*(?://|\|\|)\s*(?=${LETTER_TOKEN}\b)`, "g"),
    "$1∥",
  );
  // 相似：△ADE ~ △ABC → △ADE∽△ABC；∼（U+223C）与 ∽（U+223D）混用同样归一
  out = out.replace(/(△[^，。；、\s]*)\s*[~∼]\s*(?=△)/g, "$1∽");
  return out;
}

/** 修复「∠AED = ACB」这类等号右侧丢失 ∠ 的写法（保留原有空格风格）。 */
export function repairMissingAngleSymbols(text: string): string {
  return text.replace(
    new RegExp(String.raw`(∠${LETTER_TOKEN}\s*=)(\s*)([A-Z][A-Z]{0,2})(?!${LETTER_TOKEN})`, "g"),
    "$1$2∠$3",
  );
}

/**
 * 修复「ADC = 110°」这类左侧丢失 ∠ 的写法。
 * 判据是等号右侧带度号——「AB = 2.5 米」这类线段长度没有度号，不会被误改成角。
 */
export function repairLeadingAngleSymbols(text: string): string {
  let out = text.replace(
    new RegExp(String.raw`(?<![A-Za-z∠])([A-Z][A-Z]{1,2})(\s*=\s*)(\d+(?:\.\d+)?)\s*°`, "g"),
    "∠$1$2$3°",
  );
  // 单字母角：模型写「A = 70°」而题面是「∠A = 70°」。
  // 大写单字母在几何题里就是点，带度号的赋值只可能是角；小写变量（x = 90°）不匹配。
  out = out.replace(
    new RegExp(String.raw`(?<![A-Za-z∠])([A-Z])(\s*=\s*)(\d+(?:\.\d+)?)\s*°`, "g"),
    "∠$1$2$3°",
  );
  // 等号右侧带 ∠、左侧也是角：补齐左侧（「F =∠ACB」→「∠F =∠ACB」）
  out = out.replace(
    new RegExp(String.raw`(?<![A-Za-z∠])([A-Z])(\s*=\s*)∠`, "g"),
    "∠$1$2∠",
  );
  // 算式中间夹着的单字母（「180° - B -∠ACB」→「180° - ∠B -∠ACB」）。
  // 要求前后都是运算符，避免误伤代数式（「a - B + c」里的 B 在几何题里同样是点）。
  out = out.replace(/(?<=[-+−]\s)([A-Z])(?=\s*[-+−])/g, "∠$1");
  return out;
}

/** 出题/识别文本落库前的符号级整理：cases 展平 + 近似符归一 + 补 ∠ + 连用标点折叠。 */
export function normalizeGeometryText(text: string): string {
  return tidyPunctuation(
    repairLeadingAngleSymbols(repairMissingAngleSymbols(repairGeometrySymbols(flattenCases(text)))),
  );
}
