/**
 * 数学表达式解析器：零依赖、不使用 eval / new Function。
 *
 * 背景：原实现用字符串替换 + `new Function` 求值，`2x`、`3x` 这类省略乘号的
 * 写法在 JS 中是语法错误，异常被静默 catch 后采样点全空，导致一次函数
 * `y=kx+b`、二次函数 `y=ax²+bx+c` 完全渲染不出图像（空白画布）。
 *
 * 本模块改为 tokenizer + 递归下降解析，编译成可复用的求值闭包：
 * - 支持隐式乘号（2x、3(x+1)、(x+1)(x-1)）
 * - 支持 x² / x^3 / x**2、√、π、全角与 OCR 常见写法
 * - 遵循数学惯例优先级：-x² = -(x²)，2^3^2 右结合
 * - 解析失败抛 ExpressionParseError（携带原串与位置），绝不静默
 * - 求值域错误（sqrt(-1)、1/0）返回 NaN / ±Infinity，不抛异常
 */

// ---------- 错误类型 ----------

export class ExpressionParseError extends Error {
  /** 用户原始输入（未归一化），用于日志与错误信息 */
  readonly raw: string;
  /** 归一化后的字符串，token 位置基于它 */
  readonly normalized: string;
  /** 归一化串中的字符下标（出错位置） */
  readonly position: number;
  /** 可选修复建议 */
  readonly hint?: string;

  constructor(args: {
    message: string;
    raw: string;
    normalized: string;
    position: number;
    hint?: string;
  }) {
    super(args.message);
    this.name = "ExpressionParseError";
    this.raw = args.raw;
    this.normalized = args.normalized;
    this.position = args.position;
    this.hint = args.hint;
  }
}

// ---------- AST ----------

export type AstNode =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "variable"; readonly name: "x" }
  | { readonly kind: "constant"; readonly name: string; readonly value: number }
  | { readonly kind: "negate"; readonly operand: AstNode }
  | {
      readonly kind: "binary";
      readonly op: "+" | "-" | "*" | "/" | "^";
      readonly left: AstNode;
      readonly right: AstNode;
    }
  | { readonly kind: "call"; readonly name: string; readonly arg: AstNode };

// ---------- Token ----------

export type TokenType = "NUMBER" | "IDENT" | "LPAREN" | "RPAREN" | "OP" | "POW" | "COMMA" | "EOF";

export interface Token {
  readonly type: TokenType;
  /** OP/POW 的符号，IDENT 的标识符，NUMBER 的原始字面量 */
  readonly value: string;
  /** 归一化串中的起始字符下标 */
  readonly start: number;
}

export interface CompileOptions {
  /** log 的底数。默认 10（中国初高中教材惯例：log 即常用对数）。 */
  readonly logBase?: number;
  /** 是否允许无括号函数调用（sin 2x）。默认 true。 */
  readonly allowImplicitCall?: boolean;
  /** 是否允许隐式乘号（2x）。默认 true。 */
  readonly allowImplicitMultiply?: boolean;
  /** 最大 AST 嵌套深度，防栈溢出。默认 64。 */
  readonly maxDepth?: number;
  /** 最大 token 数。默认 512。 */
  readonly maxTokens?: number;
  /** 最大输入字符数。默认 200。 */
  readonly maxLength?: number;
}

export interface CompiledExpression {
  /** 求值。域错误返回 NaN / ±Infinity，绝不抛异常。 */
  readonly evaluate: (x: number) => number;
  readonly raw: string;
  readonly normalized: string;
  readonly ast: AstNode;
}

// ---------- 常量与函数表 ----------

const DEFAULT_MAX_LENGTH = 200;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_MAX_DEPTH = 64;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

/** 变量只有 x（函数图像场景是一元函数 y=f(x)） */
const VARIABLE = "x";

function buildFunctionTable(logBase: number): Record<string, (v: number) => number> {
  const logFn = (v: number): number => Math.log(v) / Math.log(logBase);
  return {
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    exp: Math.exp,
    ln: Math.log,
    log: logFn,
    lg: logFn,
  };
}

// ---------- 归一化 ----------

const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

const SUPERSCRIPT_CHARS = Object.keys(SUPERSCRIPT_MAP).join("");

/**
 * 归一化：把各种 OCR / AI / 全角写法统一为解析器可识别的 ASCII 形式。
 *
 * 注意：所有替换都带空格包裹，避免 `2√x` 被转成 `2sqrtx` 后
 * 被 tokenizer 读成单个标识符。
 */
export function normalizeExpression(input: string): string {
  let s = input;

  // 1. 全角空格、NBSP、制表符 → 普通空格
  s = s.replace(/[\u3000\u00A0\t\r\n]/g, " ");

  // 2. 全角数字 / 字母 → 半角
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  // 3. 全角运算符与括号
  s = s.replace(/＋/g, " + ");
  s = s.replace(/－/g, " - ");
  s = s.replace(/＊/g, " * ");
  s = s.replace(/／/g, " / ");
  s = s.replace(/＝/g, " = ");
  s = s.replace(/（/g, " ( ");
  s = s.replace(/）/g, " ) ");
  s = s.replace(/[｛\[]/g, " ( ");
  s = s.replace(/[｝\]]/g, " ) ");

  // 4. 各种减号 / 破折号 → '-'
  s = s.replace(/[\u2212\u2013\u2014\u2010\u2011]/g, " - ");

  // 5. 乘号 → '*'
  s = s.replace(/[×·⋅∗]/g, " * ");

  // 6. 除号 → '/'
  s = s.replace(/[÷∕⁄]/g, " / ");

  // 7. 根号 → sqrt 函数
  s = s.replace(/∛/g, " cbrt ");
  s = s.replace(/√/g, " sqrt ");

  // 8. 圆周率
  s = s.replace(/[πΠ]/g, " pi ");

  // 9. 上标：多位连续上标数字需加括号（x¹² → x ^ ( 12 )）
  const supRe = new RegExp(`[${SUPERSCRIPT_CHARS}]+`, "g");
  s = s.replace(supRe, (m) => {
    const digits = m
      .split("")
      .map((c) => SUPERSCRIPT_MAP[c])
      .join("");
    return digits.length === 1 ? ` ^ ${digits} ` : ` ^ ( ${digits} ) `;
  });

  // 10. ** → ^（幂运算符统一）
  s = s.replace(/\*\*/g, " ^ ");

  // 11. 剥离前缀 y= / f(x)= / f=
  s = s.replace(/^\s*(?:y|Y|f\s*\(\s*x\s*\)|f)\s*=\s*/, "");

  // 12. 折叠多余空白
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// ---------- Tokenizer ----------

export function tokenize(input: string, options?: CompileOptions): Token[] {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (input.length > maxLength) {
    throw new ExpressionParseError({
      message: `表达式过长（${input.length} 字符，上限 ${maxLength}）`,
      raw: input,
      normalized: input,
      position: maxLength,
    });
  }

  const normalized = normalizeExpression(input);
  if (normalized.length === 0) {
    throw new ExpressionParseError({
      message: "表达式为空",
      raw: input,
      normalized,
      position: 0,
    });
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];

    if (ch === " " || ch === ",") {
      // 逗号保留为 COMMA token（用于报「不支持多参数函数」）
      if (ch === ",") tokens.push({ type: "COMMA", value: ",", start: i });
      i += 1;
      continue;
    }

    // 数字（含科学计数法 1e-3）
    if (isDigit(ch) || (ch === "." && isDigit(normalized[i + 1] ?? ""))) {
      const start = i;
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(normalized.slice(i));
      if (match) {
        // 校验科学计数法合法性：e 后必须跟数字或 +/-数字
        tokens.push({ type: "NUMBER", value: match[0], start });
        i += match[0].length;
        continue;
      }
    }

    // 标识符（字母序列）
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      let j = i;
      while (j < normalized.length && /[a-zA-Z]/.test(normalized[j])) j += 1;
      const word = normalized.slice(i, j);
      tokens.push({ type: "IDENT", value: word, start });
      i = j;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", start: i });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", start: i });
      i += 1;
      continue;
    }
    if (ch === "^") {
      tokens.push({ type: "POW", value: "^", start: i });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "OP", value: ch, start: i });
      i += 1;
      continue;
    }

    throw new ExpressionParseError({
      message: `非法字符 "${ch}"`,
      raw: input,
      normalized,
      position: i,
    });
  }

  if (tokens.length > maxTokens) {
    throw new ExpressionParseError({
      message: `表达式 token 过多（${tokens.length}，上限 ${maxTokens}）`,
      raw: input,
      normalized,
      position: normalized.length,
    });
  }

  tokens.push({ type: "EOF", value: "", start: normalized.length });
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

// ---------- Parser ----------

interface ParserState {
  readonly tokens: Token[];
  readonly raw: string;
  readonly normalized: string;
  readonly options: Required<Omit<CompileOptions, "logBase">> & { logBase: number };
  readonly functions: Record<string, (v: number) => number>;
  pos: number;
  depth: number;
}

function peek(state: ParserState): Token {
  return state.tokens[state.pos];
}

function peekAt(state: ParserState, offset: number): Token {
  return state.tokens[Math.min(state.pos + offset, state.tokens.length - 1)];
}

function advance(state: ParserState): Token {
  const t = state.tokens[state.pos];
  if (t.type !== "EOF") state.pos += 1;
  return t;
}

function fail(state: ParserState, message: string, position: number, hint?: string): never {
  throw new ExpressionParseError({
    message,
    raw: state.raw,
    normalized: state.normalized,
    position,
    hint,
  });
}

function enterDepth(state: ParserState, token: Token): void {
  state.depth += 1;
  if (state.depth > state.options.maxDepth) {
    fail(state, `表达式嵌套过深（上限 ${state.options.maxDepth} 层）`, token.start);
  }
}

export function parseExpression(input: string, options?: CompileOptions): AstNode {
  const state: ParserState = {
    tokens: tokenize(input, options),
    raw: input,
    normalized: normalizeExpression(input),
    options: {
      logBase: options?.logBase ?? 10,
      allowImplicitCall: options?.allowImplicitCall ?? true,
      allowImplicitMultiply: options?.allowImplicitMultiply ?? true,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
      maxTokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      maxLength: options?.maxLength ?? DEFAULT_MAX_LENGTH,
    },
    functions: buildFunctionTable(options?.logBase ?? 10),
    pos: 0,
    depth: 0,
  };

  const node = parseExpr(state);
  const t = peek(state);
  if (t.type !== "EOF") {
    fail(state, `意外的记号 "${t.value || t.type}"`, t.start);
  }
  return node;
}

/** expr := term (('+' | '-') term)*   左结合 */
function parseExpr(state: ParserState): AstNode {
  let left = parseTerm(state);
  for (;;) {
    const t = peek(state);
    if (t.type === "OP" && (t.value === "+" || t.value === "-")) {
      advance(state);
      const right = parseTerm(state);
      left = { kind: "binary", op: t.value as "+" | "-", left, right };
      continue;
    }
    // 隐式乘：term 后紧跟可开始操作数的记号
    if (canStartOperand(t, state) && state.options.allowImplicitMultiply) {
      checkImplicitMultiplyOperand(state, left, t);
      const right = parseTerm(state);
      left = { kind: "binary", op: "*", left, right };
      continue;
    }
    break;
  }
  return left;
}

/** term := factor (('*' | '/' | 隐式乘) factor)*   左结合，* 与 / 同优先级 */
function parseTerm(state: ParserState): AstNode {
  let left = parseFactor(state);
  for (;;) {
    const t = peek(state);

    if (t.type === "OP" && (t.value === "*" || t.value === "/")) {
      advance(state);
      const right = parseFactor(state);
      left = { kind: "binary", op: t.value as "*" | "/", left, right };
      continue;
    }

    if (canStartOperand(t, state) && state.options.allowImplicitMultiply) {
      checkImplicitMultiplyOperand(state, left, t);
      const right = parseFactor(state);
      left = { kind: "binary", op: "*", left, right };
      continue;
    }

    break;
  }
  return left;
}

/** factor := unary | FUNC productNoDiv | FUNC '(' expr ')' */
function parseFactor(state: ParserState): AstNode {
  const t = peek(state);

  // 函数调用（有括号）
  if (t.type === "IDENT" && isFunctionName(state, t.value) && peekAt(state, 1).type === "LPAREN") {
    advance(state); // IDENT
    advance(state); // LPAREN
    const arg = parseExpr(state);
    const close = peek(state);
    if (close.type === "COMMA") {
      fail(state, `不支持多参数函数 "${t.value}"`, close.start);
    }
    if (close.type !== "RPAREN") {
      fail(state, `函数 "${t.value}" 缺少右括号`, close.start);
    }
    advance(state);
    return { kind: "call", name: t.value, arg };
  }

  // 无括号函数调用：参数只吸收「系数 × 幂」这一层，
  // 保证 sin 2x = sin(2x)，同时 sin x cos x = sin(x)*cos(x)（数学惯例）
  if (t.type === "IDENT" && isFunctionName(state, t.value) && state.options.allowImplicitCall) {
    advance(state);
    const arg = parseCoefficientProduct(state);
    return { kind: "call", name: t.value, arg };
  }

  return parseUnary(state);
}

/**
 * 无括号函数的参数：解析一个幂表达式，若它是数字字面量则再吸收紧随的一个操作数
 * 作为系数乘法（2x → 2*x）。不吸收函数调用与除法，交给外层处理。
 */
function parseCoefficientProduct(state: ParserState): AstNode {
  const first = parseUnary(state);
  if (first.kind === "number" && state.options.allowImplicitMultiply) {
    const t = peek(state);
    // 排除 NUMBER，避免 `2 2` 这类非法输入被吞掉（应报错）
    if (t.type !== "NUMBER" && canStartOperand(t, state)) {
      checkImplicitMultiplyOperand(state, first, t);
      const second = parseUnary(state);
      return { kind: "binary", op: "*", left: first, right: second };
    }
  }
  return first;
}

/** unary := ('-' | '+') unary | power */
function parseUnary(state: ParserState): AstNode {
  const t = peek(state);
  if (t.type === "OP" && (t.value === "-" || t.value === "+")) {
    advance(state);
    enterDepth(state, t);
    const operand = parseUnary(state);
    state.depth -= 1;
    return t.value === "-" ? { kind: "negate", operand } : operand;
  }
  return parsePower(state);
}

/** power := primary ('^' unary)?   右结合 */
function parsePower(state: ParserState): AstNode {
  const base = parsePrimary(state);
  const t = peek(state);
  if (t.type === "POW") {
    advance(state);
    enterDepth(state, t);
    const exponent = parseUnary(state); // 右结合，且允许 2^-3
    state.depth -= 1;
    return { kind: "binary", op: "^", left: base, right: exponent };
  }
  return base;
}

/** primary := NUMBER | 常量 | 变量 | '(' expr ')' */
function parsePrimary(state: ParserState): AstNode {
  const t = advance(state);

  if (t.type === "NUMBER") {
    const value = Number(t.value);
    if (!Number.isFinite(value)) {
      fail(state, `无法解析数字 "${t.value}"`, t.start);
    }
    return { kind: "number", value };
  }

  if (t.type === "IDENT") {
    const lower = t.value.toLowerCase();
    if (lower === VARIABLE) return { kind: "variable", name: "x" };
    if (Object.hasOwn(CONSTANTS, lower)) {
      return { kind: "constant", name: lower, value: CONSTANTS[lower] };
    }
    if (isFunctionName(state, lower)) {
      fail(state, `函数 "${t.value}" 缺少参数`, t.start);
    }
    // 未知标识符：给出针对性提示
    const hint = /^x\d+$/.test(lower) ? "是否想输入 x^2 ？平方请用 ^ 或 ²" : undefined;
    fail(state, `未知标识符 "${t.value}"`, t.start, hint);
  }

  if (t.type === "LPAREN") {
    enterDepth(state, t);
    const inner = parseExpr(state);
    const close = peek(state);
    if (close.type !== "RPAREN") {
      fail(state, "括号不匹配，缺少右括号", close.start);
    }
    advance(state);
    state.depth -= 1;
    return inner;
  }

  if (t.type === "RPAREN") {
    fail(state, "多余的右括号", t.start);
  }

  if (t.type === "EOF") {
    fail(state, "表达式不完整，缺少操作数", t.start);
  }

  fail(state, `意外的记号 "${t.value || t.type}"`, t.start);
}

// ---------- 辅助判断 ----------

function isFunctionName(state: ParserState, name: string): boolean {
  return Object.hasOwn(state.functions, name.toLowerCase());
}

function canStartOperand(t: Token, state: ParserState): boolean {
  if (t.type === "NUMBER" || t.type === "LPAREN") return true;
  if (t.type === "IDENT") {
    const lower = t.value.toLowerCase();
    return lower === VARIABLE || Object.hasOwn(CONSTANTS, lower) || isFunctionName(state, lower);
  }
  return false;
}

/**
 * 隐式乘的禁止组合：变量后紧跟数字（如 `x2`）。
 * OCR 常把 `x²` 误识别成 `x2`，若静默按 x*2 处理会画出错误图像，
 * 在错题练习场景里比直接报错危害更大。
 */
function checkImplicitMultiplyOperand(state: ParserState, left: AstNode, next: Token): void {
  // 变量后紧跟数字（x2）：OCR 常把 x² 误识别成 x2，静默按 x*2 处理会画出错误图像
  if (left.kind === "variable" && next.type === "NUMBER") {
    fail(
      state,
      `无法解析 "x${next.value}"`,
      next.start,
      "是否想输入 x^2 ？平方请用 ^ 或 ²，乘法请显式写 *",
    );
  }
  // 两个相邻数字（2 2）：缺少运算符，无合法数学含义
  if (left.kind === "number" && next.type === "NUMBER") {
    fail(state, `意外的数字 "${next.value}"`, next.start, "两个数字之间缺少运算符");
  }
}

// ---------- 编译为闭包 ----------

function isConstantNode(node: AstNode): boolean {
  switch (node.kind) {
    case "number":
    case "constant":
      return true;
    case "variable":
      return false;
    case "negate":
      return isConstantNode(node.operand);
    case "binary":
      return isConstantNode(node.left) && isConstantNode(node.right);
    case "call":
      return isConstantNode(node.arg);
  }
}

function buildClosure(
  node: AstNode,
  functions: Record<string, (v: number) => number>,
): (x: number) => number {
  switch (node.kind) {
    case "number":
    case "constant": {
      const v = node.value;
      return () => v;
    }
    case "variable":
      return (x) => x;
    case "negate": {
      const f = buildClosure(node.operand, functions);
      return (x) => -f(x);
    }
    case "binary": {
      const l = buildClosure(node.left, functions);
      const r = buildClosure(node.right, functions);
      switch (node.op) {
        case "+":
          return (x) => l(x) + r(x);
        case "-":
          return (x) => l(x) - r(x);
        case "*":
          return (x) => l(x) * r(x);
        case "/":
          return (x) => l(x) / r(x);
        case "^":
          return (x) => Math.pow(l(x), r(x));
      }
    }
    // eslint-disable-next-line no-fallthrough
    case "call": {
      const f = buildClosure(node.arg, functions);
      const fn = functions[node.name.toLowerCase()];
      return (x) => fn(f(x));
    }
  }
}

export function compileExpression(input: string, options?: CompileOptions): CompiledExpression {
  const ast = parseExpression(input, options);
  const functions = buildFunctionTable(options?.logBase ?? 10);

  // 常量表达式在编译期折叠（-x^2 中的 2、pi、1/2 等）
  if (isConstantNode(ast)) {
    const value = buildClosure(ast, functions)(0);
    return {
      evaluate: () => value,
      raw: input,
      normalized: normalizeExpression(input),
      ast,
    };
  }

  const evaluate = buildClosure(ast, functions);
  return {
    // 域错误（sqrt(-1) → NaN、1/0 → Infinity）由 IEEE-754 自然表达，不抛异常
    evaluate: (x: number): number => evaluate(x),
    raw: input,
    normalized: normalizeExpression(input),
    ast,
  };
}

/** 便捷单次求值 */
export function evaluateExpression(
  input: string,
  x: number,
  options?: CompileOptions,
): number {
  return compileExpression(input, options).evaluate(x);
}
