import { describe, expect, it } from "vitest";
import {
  compileExpression,
  ExpressionParseError,
  evaluateExpression,
} from "./expression-parser";

const evalAt = (expr: string, x = 0): number => compileExpression(expr).evaluate(x);

describe("表达式解析器 - 归一化与全角兼容", () => {
  it("支持全角等号、数字与字母", () => {
    expect(evalAt("y＝２ｘ＋１", 2)).toBe(5);
  });

  it("支持各种乘号与除号", () => {
    expect(evalAt("2×x", 3)).toBe(6);
    expect(evalAt("2·x", 3)).toBe(6);
    expect(evalAt("x÷2", 4)).toBe(2);
  });

  it("支持 Unicode 减号与破折号", () => {
    expect(evalAt("x−1", 3)).toBe(2); // U+2212
    expect(evalAt("x–1", 3)).toBe(2); // U+2013
  });

  it("支持根号与圆周率", () => {
    expect(evalAt("√x", 9)).toBe(3);
    expect(evalAt("2√x", 9)).toBe(6);
    expect(evalAt("√(x+1)", 3)).toBe(2);
    expect(evalAt("π")).toBeCloseTo(Math.PI, 12);
  });

  it("支持上标与多位指数", () => {
    expect(evalAt("2x²", 3)).toBe(18);
    expect(evalAt("x^12", 2)).toBe(4096);
    expect(evalAt("x¹²", 2)).toBe(4096);
  });

  it("支持 y= / f(x)= 前缀与裸表达式", () => {
    expect(evalAt("y = 2x + 1", 2)).toBe(5);
    expect(evalAt("f(x)=2x", 2)).toBe(4);
    expect(evalAt("2x+1", 2)).toBe(5);
  });
});

describe("表达式解析器 - 优先级与结合性", () => {
  it("先乘除后加减", () => {
    expect(evalAt("2+3*4")).toBe(14);
    expect(evalAt("(2+3)*4")).toBe(20);
  });

  it("幂运算右结合", () => {
    expect(evalAt("2^3^2")).toBe(512);
    expect(evalAt("2**3**2")).toBe(512);
  });

  it("一元负号优先级低于幂：-x² 恒等于 -(x²)", () => {
    expect(evalAt("-x^2", 3)).toBe(-9);
    expect(evalAt("-2^2")).toBe(-4);
    expect(evalAt("(-3)^2")).toBe(9);
    expect(evalAt("2^-2")).toBe(0.25);
  });

  it("乘除左结合", () => {
    expect(evalAt("1/2*4")).toBe(2);
    expect(evalAt("8/4/2")).toBe(1);
    expect(evalAt("2-3-4")).toBe(-5);
  });

  it("1/2x 按左结合解析为 (1/2)*x", () => {
    expect(evalAt("1/2x", 4)).toBe(2);
    expect(evalAt("1/(2x)", 4)).toBe(0.125);
  });
});

describe("表达式解析器 - 隐式乘号", () => {
  it("数字与变量/括号", () => {
    expect(evalAt("2x", 3)).toBe(6);
    expect(evalAt("3(x+1)", 1)).toBe(6);
    expect(evalAt("2(x+1)", 1)).toBe(4);
    expect(evalAt(".5x", 2)).toBe(1);
  });

  it("括号之间与括号后接数字", () => {
    expect(evalAt("(x+1)(x-1)", 3)).toBe(8);
    expect(evalAt("x(x+1)", 2)).toBe(6);
    expect(evalAt("(x+1)2", 1)).toBe(4);
  });

  it("常量参与隐式乘", () => {
    expect(evalAt("2pi")).toBeCloseTo(2 * Math.PI, 12);
    expect(evalAt("pi x", 2)).toBeCloseTo(2 * Math.PI, 12);
    expect(evalAt("pi(x+1)", 0)).toBeCloseTo(Math.PI, 12);
  });

  it("与函数调用组合", () => {
    expect(evalAt("2sin(0)")).toBe(0);
    expect(evalAt("(x+1)sin(0)", 1)).toBe(0);
  });

  it("科学计数法与常量 e 正确区分", () => {
    expect(evalAt("1e-3")).toBeCloseTo(0.001, 15);
    expect(evalAt("2e")).toBeCloseTo(2 * Math.E, 12);
  });
});

describe("表达式解析器 - 函数调用", () => {
  it("常见数学函数", () => {
    expect(evalAt("sqrt(4)")).toBe(2);
    expect(evalAt("sqrt(x+1)", 3)).toBe(2);
    expect(evalAt("2sqrt(4)")).toBe(4);
    expect(evalAt("abs(x)", -3)).toBe(3);
    expect(evalAt("sin(0)")).toBe(0);
    expect(evalAt("cos(0)")).toBe(1);
    expect(evalAt("tan(0)")).toBe(0);
    expect(evalAt("exp(0)")).toBe(1);
    expect(evalAt("exp(1)")).toBeCloseTo(Math.E, 12);
  });

  it("无括号函数调用", () => {
    expect(evalAt("sin 0")).toBe(0);
    expect(evalAt("sin 2x", Math.PI / 6)).toBeCloseTo(Math.sin(Math.PI / 3), 12);
    expect(evalAt("sin x^2", 2)).toBeCloseTo(Math.sin(4), 12);
    expect(evalAt("sin x cos x", Math.PI / 4)).toBeCloseTo(0.5, 12);
  });

  it("无括号函数不吞除号：sin x/2 等于 sin(x)/2", () => {
    expect(evalAt("sin x/2", 1)).toBeCloseTo(Math.sin(1) / 2, 12);
    expect(evalAt("sin x + 1", 0)).toBe(1);
  });

  it("log 底数为 10，ln 为自然对数", () => {
    expect(evalAt("log(100)")).toBeCloseTo(2, 12);
    expect(evalAt("lg(100)")).toBeCloseTo(2, 12);
    expect(evalAt("ln(e)")).toBeCloseTo(1, 12);
    expect(evalAt("ln(1)")).toBeCloseTo(0, 12);
  });
});

describe("表达式解析器 - 错误处理", () => {
  const expectThrow = (expr: string): ExpressionParseError => {
    let caught: unknown;
    try {
      compileExpression(expr);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExpressionParseError);
    return caught as ExpressionParseError;
  };

  it("语法错误抛 ExpressionParseError 并保留原串", () => {
    const err = expectThrow("2x+");
    expect(err.raw).toBe("2x+");
    expect(err.message).toContain("缺少操作数");
  });

  it("括号不匹配", () => {
    expectThrow("(x+1").message;
    expectThrow("x+1)");
    expectThrow("((((1");
  });

  it("x2 报错并给出平方提示（OCR 常把 x² 误识别为 x2）", () => {
    const err = expectThrow("x2");
    expect(err.hint).toContain("x^2");
  });

  it("未知标识符与未知函数", () => {
    expectThrow("xy");
    expectThrow("pix");
    expectThrow("foo(x)");
  });

  it("函数参数问题", () => {
    expectThrow("sin(");
    expectThrow("sin(x,2)");
  });

  it("空表达式与非法字符", () => {
    expectThrow("");
    expectThrow("   ");
    expectThrow("x的平方");
  });

  it("相邻数字缺少运算符", () => {
    expectThrow("2 2");
  });

  it("超长表达式被拒绝", () => {
    expectThrow("1+".repeat(300));
  });
});

describe("表达式解析器 - 求值域错误不抛异常", () => {
  it("返回 NaN / ±Infinity 交由采样层当断点处理", () => {
    expect(Number.isNaN(evalAt("sqrt(x)", -1))).toBe(true);
    expect(evalAt("1/x", 0)).toBe(Infinity);
    expect(evalAt("1/x", -0)).toBe(-Infinity);
    expect(evalAt("log(x)", 0)).toBe(-Infinity);
    expect(Number.isNaN(evalAt("log(x)", -1))).toBe(true);
  });
});

describe("表达式解析器 - 目标题型回归", () => {
  it("一次函数 y=kx+b（原实现完全失败）", () => {
    expect(evalAt("y=2x+1", 2)).toBe(5);
    expect(evalAt("y=-3x+2", 1)).toBe(-1);
    expect(evalAt("y=1/2x+1", 4)).toBe(3);
  });

  it("二次函数 y=ax²+bx+c（原实现完全失败）", () => {
    expect(evalAt("y=x^2-2x+1", 3)).toBe(4);
    expect(evalAt("y=x²-2x+1", 3)).toBe(4);
    expect(evalAt("y=-x^2+4", 2)).toBe(0);
    expect(evalAt("y=2x^2+3x-5", 1)).toBe(0);
  });

  it("反比例函数 y=k/x", () => {
    expect(evalAt("y=1/x", 2)).toBe(0.5);
    expect(evalAt("y=6/x", 3)).toBe(2);
  });

  it("便捷函数 evaluateExpression 可用", () => {
    expect(evaluateExpression("2x+1", 3)).toBe(7);
  });
});
