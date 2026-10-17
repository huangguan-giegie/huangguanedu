import {describe,expect,it} from "vitest";
import {
 parsePolynomial,polynomialText,runCAS,derivative,evaluatePolynomial,rat,
} from "./polynomial-cas";
describe("一元多项式 CAS 使用精确有理数而非浮点猜测",()=>{
 it("括号、隐式乘法与合并同类项",()=>{
  expect(polynomialText(parsePolynomial("(x+2)(x-3)+2x"))).toBe("x^2 + x - 6");
  expect(polynomialText(parsePolynomial("2(x+1)(x-2)"))).toBe("2x^2 - 2x - 4");
  expect(polynomialText(parsePolynomial("-x^2+x^2+3"))).toBe("3");
  expect(polynomialText(parsePolynomial("0.5x + x/4"))).toBe("3/4x");
  expect(polynomialText(parsePolynomial("3x^2 - (2x)^2"))).toBe("-x^2");
 });
 it("符号求导与代入求值",()=>{
  const p=parsePolynomial("3x^3-2x+1");
  expect(polynomialText(derivative(p))).toBe("9x^2 - 2");
  expect(evaluatePolynomial(p,rat(2))).toEqual(rat(21));
  expect(runCAS("3x^3-2x+1","differentiate").result).toBe("9x^2 - 2");
  expect(runCAS("x^2-1","evaluate","1/2").result).toBe("-3/4");
 });
 it("分解和求解有理一二次方程，重根与无实根",()=>{
  expect(runCAS("x^2-5x+6","factor").result).toBe("1(x - 2)(x - 3)");
  expect(runCAS("2x+4=0","solve").result).toBe("x = -2");
  expect(runCAS("x^2-4=0","solve").result).toContain("x = -2 或 x = 2");
  expect(runCAS("x^2+2x+1=0","solve").result).toBe("x = -1");
  expect(runCAS("x^2+1=0","solve").result).toContain("无实数根");
  expect(runCAS("0=0","solve").result).toContain("任意");
  expect(runCAS("2=3","solve").result).toBe("无解");
  expect(runCAS("x^2-2=0","solve").result).toContain("近似");
 });
 it("拒绝不受支持的函数、非多项式、溢出、注入和负幂",()=>{
  for(const value of ["sin(x)","alert(1)","x^-2","x^9","1/(x+1)","x**2","x+y","1/0","x^1000","2=2"]){
   expect(()=>parsePolynomial(value),value).toThrow();
  }
  expect(()=>runCAS("x^3-8=0","solve")).toThrow("仅支持");
  expect(()=>runCAS("x^3-1","factor")).toThrow("仅支持");
  expect(()=>runCAS("","simplify")).toThrow();
  expect(()=>parsePolynomial("2".repeat(151))).toThrow("150");
 });
});
