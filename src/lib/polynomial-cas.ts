/** A safe, deterministic univariate polynomial CAS with exact rational coefficients.
 * No eval, dynamic code, remotely supplied formulas, or decimal round-off in algebra.
 * Degree <= 8 and restricted intermediate numerator/denominator cap prevent abuse.
 */
export type Rational={n:number;d:number};
export type Polynomial=Rational[];
export type CasAction="simplify"|"differentiate"|"factor"|"solve"|"evaluate";
export interface CasResult{input:string;action:CasAction;result:string;steps:string[]}
const MAX_DEGREE=8,MAX_MAG=1e11,MAX_TEXT=150;
const gcd=(a:number,b:number):number=>{a=Math.abs(a);b=Math.abs(b);while(b){const t=a%b;a=b;b=t;}return a||1;};
export function rat(n:number,d=1):Rational{
 if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d===0)throw Error("分数溢出或出现零分母");
 if(Math.abs(n)>MAX_MAG||Math.abs(d)>MAX_MAG)throw Error("系数过大，请缩小算式");
 if(n===0)return {n:0,d:1};
 const g=gcd(n,d),sign=d<0?-1:1;
 return {n:n/g*sign,d:Math.abs(d)/g};
}
const zero=()=>rat(0);
const radd=(a:Rational,b:Rational)=>rat(a.n*b.d+b.n*a.d,a.d*b.d);
const rneg=(a:Rational)=>rat(-a.n,a.d);
const rsub=(a:Rational,b:Rational)=>radd(a,rneg(b));
const rmul=(a:Rational,b:Rational)=>rat(a.n*b.n,a.d*b.d);
const rdiv=(a:Rational,b:Rational)=>rat(a.n*b.d,a.d*b.n);
export function rationalText(r:Rational):string{return r.d===1?String(r.n):r.n+"/"+r.d;}
export function normalize(p:Polynomial):Polynomial{
 const out=p.slice();
 while(out.length>1&&out[out.length-1].n===0)out.pop();
 if(out.length>MAX_DEGREE+1)throw Error("仅支持最高 8 次多项式");
 return out.length?out:[zero()];
}
const constant=(r:Rational):Polynomial=>[r];
const polyAdd=(a:Polynomial,b:Polynomial):Polynomial=>normalize(Array.from({length:Math.max(a.length,b.length)},(_,i)=>radd(a[i]||zero(),b[i]||zero())));
const polyNeg=(a:Polynomial):Polynomial=>a.map(rneg);
const polySub=(a:Polynomial,b:Polynomial):Polynomial=>polyAdd(a,polyNeg(b));
const polyMul=(a:Polynomial,b:Polynomial):Polynomial=>{
 if(a.length+b.length-2>MAX_DEGREE)throw Error("乘法后超过 8 次多项式限制");
 const out=Array.from({length:a.length+b.length-1},zero);
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)out[i+j]=radd(out[i+j],rmul(a[i],b[j]));
 return normalize(out);
};
const polyPow=(p:Polynomial,n:number):Polynomial=>{
 if(!Number.isInteger(n)||n<0||n>MAX_DEGREE)throw Error("指数只能为 0–8 的非负整数");
 let result=constant(rat(1));
 for(let i=0;i<n;i++)result=polyMul(result,p);
 return result;
};
type Token={type:"number"|"x"|"op"|"end";value:string};
function tokenize(expr:string):Token[]{
 expr=expr.replace(/²/g,"^2").replace(/³/g,"^3").replace(/[×·]/g,"*").replace(/÷/g,"/").replace(/[－−]/g,"-").replace(/＝/g,"=");
 if(expr.length>MAX_TEXT)throw Error("表达式最多 150 字符");
 const raw:Token[]=[];
 let i=0;
 while(i<expr.length){
  const ch=expr[i];
  if(/\s/.test(ch)){i++;continue;}
  if(/[0-9]/.test(ch)){
   const m=/^(?:\d+(?:\.\d+)?)/.exec(expr.slice(i));
   if(!m)throw Error("无效数字");
   raw.push({type:"number",value:m[0]});i+=m[0].length;continue;
  }
  if(ch==="x"||ch==="X"){raw.push({type:"x",value:"x"});i++;continue;}
  if("+-*/^()=".includes(ch)){raw.push({type:"op",value:ch});i++;continue;}
  throw Error("不支持的字符："+ch+"（仅支持 x、数字、+−×÷、括号、整数次幂）");
 }
 const out:Token[]=[];
 for(const token of raw){
  const prev=out[out.length-1];
  if(prev && (prev.type==="number"||prev.type==="x"||prev.value===")") &&
    (token.type==="x"||token.type==="number"||token.value==="(") &&
    !(prev.type==="number"&&token.type==="number"))out.push({type:"op",value:"*"});
  out.push(token);
 }
 out.push({type:"end",value:""});
 return out;
}
function decimal(s:string):Rational{
 const parts=s.split("."),places=parts[1]?.length??0,den=10**places;
 if(places>6)throw Error("小数最多 6 位");
 return rat(Number(parts.join("")),den);
}
export function parsePolynomial(expr:string):Polynomial{
 const tokens=tokenize(expr);let cursor=0;
 const peek=()=>tokens[cursor].value;
 const eat=(value:string)=>{if(peek()!==value)throw Error("期望 "+value);cursor++;};
 function primary():Polynomial{
  const t=tokens[cursor];
  if(t.type==="number"){cursor++;return constant(decimal(t.value));}
  if(t.type==="x"){cursor++;return [zero(),rat(1)];}
  if(t.value==="("){eat("(");const inside=sum();eat(")");return inside;}
  throw Error("表达式缺少数字、x 或括号");
 }
 function power():Polynomial{
  let p=primary();
  if(peek()==="^"){
   eat("^");const t=tokens[cursor++];
   if(t.type!=="number"||!/^\d+$/.test(t.value))throw Error("幂指数必须是非负整数");
   p=polyPow(p,Number(t.value));
  }
  return p;
 }
 function unary():Polynomial{
  if(peek()==="+"){eat("+");return unary();}
  if(peek()==="-"){eat("-");return polyNeg(unary());}
  return power();
 }
 function product():Polynomial{
  let p=unary();
  while(peek()==="*"||peek()==="/"){
   const op=peek();cursor++;
   const right=unary();
   if(op==="*")p=polyMul(p,right);
   else{
    if(right.length!==1||right[0].n===0)throw Error("只能除以非零常数，不支持有理函数除法");
    p=p.map(x=>rdiv(x,right[0]));
   }
  }
  return p;
 }
 function sum():Polynomial{
  let p=product();
  while(peek()==="+"||peek()==="-"){
   const op=peek();cursor++;
   const right=product();
   p=op==="+"?polyAdd(p,right):polySub(p,right);
  }
  return p;
 }
 const result=sum();
 if(tokens[cursor].type!=="end")throw Error("表达式末尾存在多余符号");
 return normalize(result);
}
export function polynomialText(p:Polynomial):string{
 const terms:string[]=[];
 for(let i=p.length-1;i>=0;i--){
  const c=p[i];if(c.n===0)continue;
  const neg=c.n<0,abs=rat(Math.abs(c.n),c.d);
  const coeff=i>0&&abs.n===abs.d?"":rationalText(abs);
  const x=i===0?"":i===1?"x":"x^"+i;
  const t=coeff+x;
  terms.push((terms.length?(neg?" - ":" + "):(neg?"-":""))+t);
 }
 return terms.join("")||"0";
}
export function derivative(p:Polynomial):Polynomial{
 return normalize(p.slice(1).map((c,i)=>rmul(c,rat(i+1))));
}
export function integrate(p:Polynomial):Polynomial{
 if(p.length>MAX_DEGREE)throw Error("积分结果次数超过 8");
 return normalize([zero(),...p.map((c,i)=>rdiv(c,rat(i+1)))]);
}
export function evaluatePolynomial(p:Polynomial,x:Rational):Rational{
 return p.reduceRight((result,coefficient)=>radd(rmul(result,x),coefficient),zero());
}
function perfectSquare(n:number):number|null{
 if(!Number.isSafeInteger(n)||n<0)return null;
 const root=Math.round(Math.sqrt(n));
 return root*root===n?root:null;
}
function rootText(r:Rational):string{return rationalText(r);}
function quadraticRoots(p:Polynomial):{texts:string[];rationalRoots:Rational[]}{
 const a=p[2],b=p[1],c=p[0];
 const D=rsub(rmul(b,b),rmul(rat(4),rmul(a,c)));
 if(D.n<0)return {texts:["无实数根（判别式 < 0）"],rationalRoots:[]};
 const sn=perfectSquare(D.n),sd=perfectSquare(D.d);
 if(sn!==null&&sd!==null){
  const sqrtD=rat(sn,sd),den=rmul(rat(2),a);
  const one=rdiv(rsub(rneg(b),sqrtD),den),two=rdiv(radd(rneg(b),sqrtD),den);
  const roots=one.n===two.n&&one.d===two.d?[one]:[one,two];
  return {texts:roots.map(rootText),rationalRoots:roots};
 }
 const Dnum=Number(D.n/D.d);
 const aNum=a.n/a.d,bNum=b.n/b.d;
 const roots=[(-bNum-Math.sqrt(Dnum))/(2*aNum),(-bNum+Math.sqrt(Dnum))/(2*aNum)]
   .filter(Number.isFinite).sort((x,y)=>x-y);
 return {texts:roots.map(v=>v.toFixed(6)+"（近似）"),rationalRoots:[]};
}
export function runCAS(expression:string,action:CasAction,atX="2"):CasResult{
 const input=expression.trim();
 if(!input)throw Error("请输入表达式");
 if(action==="solve"){
  const split=input.split("=");
  if(split.length>2)throw Error("等式只允许一个等号");
  const p=polySub(parsePolynomial(split[0]),parsePolynomial(split[1]??"0"));
  const canonical=polynomialText(p)+" = 0";
  const degree=p.length-1;
  if(degree===0)return {input,action,result:p[0].n===0?"恒等式：任意实数 x":"无解",steps:["移项合并："+canonical]};
  if(degree>2)throw Error("目前仅支持一元一次和二次方程求根");
  if(degree===1){
   const root=rdiv(rneg(p[0]),p[1]);
   return {input,action,result:"x = "+rootText(root),steps:["移项并化简："+canonical,"解得 x = "+rootText(root)]};
  }
  const q=quadraticRoots(p);
  return {input,action,result:q.rationalRoots.length?"x = "+q.texts.join(" 或 x = "):q.texts.every(t=>t.includes("近似"))?"x ≈ "+q.texts.join(" 或 x ≈ "):q.texts.join(""),
   steps:["移项并化简："+canonical,"判别式 Δ = b² - 4ac = "+rationalText(rsub(rmul(p[1],p[1]),rmul(rat(4),rmul(p[2],p[0]))))]};
 }
 if(input.includes("="))throw Error("此操作需要表达式；求解等式请选择「解方程」");
 const p=parsePolynomial(input),canonical=polynomialText(p);
 if(action==="simplify")return {input,action,result:canonical,steps:["按多项式规则展开并合并同类项。",canonical]};
 if(action==="differentiate")return {input,action,result:polynomialText(derivative(p)),steps:["先展开："+canonical,"逐项使用 (cx^n)' = cnx^(n−1)。"]};
 if(action==="evaluate"){
  const x=parsePolynomial(atX);
  if(x.length!==1)throw Error("代入值必须是常数");
  const result=evaluatePolynomial(p,x[0]);
  return {input,action,result:rationalText(result),steps:["多项式："+canonical,"代入 x = "+rationalText(x[0])]};
 }
 if(action==="factor"){
  if(p.length===1)return {input,action,result:canonical,steps:["常数无法进一步分解"]};
  if(p.length===2){
   const root=rdiv(rneg(p[0]),p[1]);
   const result=rationalText(p[1])+"(x"+(root.n>=0?" - ":" + ")+rationalText(rat(Math.abs(root.n),root.d))+")";
   return {input,action,result,steps:["一次式提取系数及零点："+canonical]};
  }
  if(p.length!==3)throw Error("目前仅支持一次和二次多项式因式分解");
  const roots=quadraticRoots(p);
  if(!roots.rationalRoots.length)throw Error("该式在有理数域内无法分解成一次因式（可使用「解方程」）");
  const f=(r:Rational)=>"(x "+(r.n>=0?"-":"+")+" "+rationalText(rat(Math.abs(r.n),r.d))+")";
  const result=rationalText(p[2])+roots.rationalRoots.map(f).join("")+(roots.rationalRoots.length===1?f(roots.rationalRoots[0]):"");
  return {input,action,result,steps:["原式："+canonical,"计算判别式后得到有理零点："+roots.texts.join("，")]};
 }
 throw Error("未知 CAS 操作");
}
