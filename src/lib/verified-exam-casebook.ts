/** Two exam-linked, auditable question chains. Each transformed variant is original.
 * Source structures:
 * 2025 吉林中考数学第22题: parabola, ray extension, area partition and vertex.
 * 2024 新高考I卷椭圆解答题: identify ellipse, inverse area condition for a secant.
 */
export type Point={x:number;y:number};
export type ExamStep={title:string;task:string;answer:string;proof:string;kind:"proved"|"exploration"};
const f=(n:number)=>Math.abs(n)<1e-9?"0":String(Number(n.toFixed(5)));
const valid=(n:number,low:number,high:number,name:string)=>{
  if(!Number.isFinite(n)||n<low||n>high)throw Error(`${name}超出有效参数范围`);
};
const roots=(a:number,b:number,c:number):number[]=>{
  if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?[]:[-c/b];
  const discriminant=b*b-4*a*c;
  if(discriminant<-1e-10)return [];
  if(Math.abs(discriminant)<1e-10)return [-b/(2*a)];
  const d=Math.sqrt(discriminant);
  return [(-b-d)/(2*a),(-b+d)/(2*a)].sort((x,y)=>x-y);
};
const dedupe=(numbers:number[]):number[]=>numbers
  .filter(Number.isFinite).sort((x,y)=>x-y).filter((n,i,arr)=>i===0||Math.abs(n-arr[i-1])>1e-8);
export interface JilinInput { knownX:number;knownY:number;ratio:number;movingX:number }
export interface JilinOutput {
  coefficient:number;vertex:Point;point:Point;other:Point;corner:Point;
  curve:(x:number)=>number;validTriangle:boolean;areaSides:[number,number];
  areaRatio:string;criticalPoints:Point[];descendingInside:boolean|null;
  insideIntervals:[number,number][];parts:ExamStep[];
}
/** Complete sign-partition of a parabola against three triangle sides.
 * No sampling: endpoints are all polynomial roots of the boundary equalities.
 */
export function classifyJilinInterior(b:number,ratio:number,m:number):
  {intervals:[number,number][];descending:boolean|null}{
  const v=m*m+b*m-1;
  if(Math.abs(m)<1e-10||Math.abs(v)<1e-10)return {intervals:[],descending:null};
  const left=Math.min(m,-ratio*m),right=Math.max(m,-ratio*m);
  const yQ=-ratio*v,slope=v/m,vertexX=-b/2;
  const breakpoints=dedupe([left,right,
    ...roots(1,b,-1-yQ),
    ...roots(1,b-slope,-1),
    vertexX]).filter(x=>x>=left-1e-9&&x<=right+1e-9);
  const intervals:[number,number][]=[];
  for(let i=0;i<breakpoints.length-1;i++){
    const lo=Math.max(left,breakpoints[i]),hi=Math.min(right,breakpoints[i+1]);
    if(hi-lo<1e-9)continue;
    const mid=(lo+hi)/2,curve=mid*mid+b*mid-1,line=slope*mid;
    if((curve-yQ)*(curve-line)<-1e-11)intervals.push([lo,hi]);
  }
  return {intervals,descending:intervals.length===0?null:intervals.every(([,end])=>end<=vertexX+1e-8)};
}
export function analyzeJilin(input:JilinInput):JilinOutput {
  const {knownX,knownY,ratio,movingX:m}=input;
  valid(knownX,1,5,"给定点横坐标");valid(knownY,-10,12,"给定点纵坐标");
  valid(ratio,.5,5,"延长比例");valid(m,-5,6,"动点横坐标");
  const b=(knownY-knownX*knownX+1)/knownX;
  const curve=(x:number)=>x*x+b*x-1;
  const y=curve(m),vertex={x:-b/2,y:-1-b*b/4};
  const point={x:m,y},other={x:-ratio*m,y:-ratio*y},corner={x:m,y:other.y};
  const validTriangle=Math.abs(m*y)>1e-9;
  const similar=ratio*ratio,remaining=1+2*ratio;
  const areaRatio=`${f(similar)} : ${f(remaining)}`;
  // The *segment* MQ, not merely its infinite supporting line,
  // must contain the parabola vertex at x=-b/2.
  const candidate=roots(1,b,-1+vertex.y/ratio).filter(t=>
    Math.min(t,-ratio*t)-1e-9<=vertex.x&&vertex.x<=Math.max(t,-ratio*t)+1e-9);
  const criticalPoints=candidate.map(t=>({x:-ratio*t,y:vertex.y}));
  const interior=classifyJilinInterior(b,ratio,m);
  const original=Math.abs(knownX-2)<1e-9&&Math.abs(knownY+1)<1e-9&&Math.abs(ratio-2)<1e-9;
  const originalIntersection="Q=(−2±2√3, −2)";
  const rootMessage=original?originalIntersection:criticalPoints.length
    ?criticalPoints.map(q=>`(${f(q.x)},${f(q.y)})`).join("；"):"当前约束无实数位置";
  const parts:ExamStep[]=[
    {title:"第（1）问 · 待定系数求抛物线",kind:"proved",
      task:`设曲线 y=x²+bx−1 经过 T(${f(knownX)},${f(knownY)})，求 b 并写出函数解析式。`,
      answer:`b=${f(b)}；y=x²+${f(b)}x−1`,
      proof:`将 T 坐标代入，得到 ${f(knownY)}=${f(knownX)}²+b×${f(knownX)}−1，解得 b=(${f(knownY)}−${f(knownX)}²+1)/${f(knownX)}=${f(b)}。`},
    {title:"第（2）问 · 相似与面积比定值",kind:"proved",
      task:`沿射线 PO 的反向延长线取 Q，使 OQ=${f(ratio)}·OP，画出以 P、Q、M 为顶点的直角三角形。证明 y 轴将其分割成的、分别位于 Q 侧与 P 侧的面积比为定值。`,
      answer:`S(Q侧) : S(P侧) = ${areaRatio}${validTriangle?"":"；当前 P 位于坐标轴导致三角形退化，需移动 P 才能比较面积"}`,
      proof:`由 O、P、Q 共线，Q=−${f(ratio)}P，且 PM⊥QM。过 O 作与 PM 平行的竖线，得到位于 Q 一侧的小直角三角形与 △QMP 相似，线性比为 ${f(ratio)}:(1+${f(ratio)})，故面积占整三角形 ${f(similar)}/${f((1+ratio)**2)}；另一侧占 ${f(remaining)}/${f((1+ratio)**2)}，两侧面积比为 ${areaRatio}，不依赖动点 m（非退化时）。`},
    {title:"第（3）问 · 顶点触发的多解条件",kind:"proved",
      task:"当水平边 MQ 经过抛物线顶点时，求 Q 的所有可能位置，并解释为什么要考虑多个分支。",
      answer:rootMessage,
      proof:`抛物线顶点为 V(${f(vertex.x)},${f(vertex.y)})，水平边 MQ 所在直线 y=${f(-ratio)}(m²+${f(b)}m−1)。使其通过 V，应令 −${f(ratio)}(m²+${f(b)}m−1)=${f(vertex.y)}。解得 ${candidate.length} 个实数 m 分支；Q 坐标为 (−${f(ratio)}m,${f(vertex.y)})。`},
    {title:"第（4）问 · 动点与单调性的分段讨论",kind:"exploration",
      task:"研究抛物线落入 △PQM 内部的部分，是否全部位于其对称轴的左侧，从而随 x 增大而减小。探索临界位置。",
      answer:!validTriangle?"三角形退化，本问当前不适用":
        interior.descending===null?"当前没有非空的内部抛物线弧段":
        interior.descending?"当前 m 位置满足所检查的单调性":"当前 m 位置不满足所检查的单调性",
      proof:"程序精确求解抛物线与三角形三条边所在直线的二次交点，按这些根分割横坐标区间后检查内部开区间，再与顶点横坐标比较。此处只判断当前 m；完整 m 取值范围仍需讨论各临界分支，不伪称扫描结果为精确区间答案。"},
  ];
  return {coefficient:b,vertex,point,other,corner,curve,validTriangle,
    areaSides:[similar,remaining],areaRatio,criticalPoints,
    descendingInside:interior.descending,insideIntervals:interior.intervals,parts};
}

export interface GaokaoInput {majorSquared:number;minorSquared:number;pointAngle:number;area:number }
export interface ConicCandidate {
  branch:1|-1;point:Point;slope:number|null;vertical:boolean;distanceFromP:number;
}
export interface GaokaoOutput {
  A:Point;P:Point;eccentricity:number;equation:string;candidateLines:{
    branch:1|-1;normal:[number,number];constant:number;points:Point[];
  }[];
  candidates:ConicCandidate[];parts:ExamStep[];
  isOriginal:boolean;
}
export function analyzeGaokao(input:GaokaoInput):GaokaoOutput {
  const {majorSquared:a2,minorSquared:b2,pointAngle,area}=input;
  valid(a2,7,48,"长轴平方");valid(b2,4,32,"短轴平方");
  if(a2<=b2)throw Error("必须满足 a²>b²>0");
  valid(pointAngle,0,80,"P的参数角");valid(area,.5,25,"三角形面积");
  const a=Math.sqrt(a2),b=Math.sqrt(b2),angle=pointAngle*Math.PI/180;
  const A={x:0,y:b},P={x:a*Math.cos(angle),y:b*Math.sin(angle)};
  const ecc=Math.sqrt(1-b2/a2);
  const normal:[number,number]=[A.y-P.y,P.x];
  const base=normal[1]*b;
  const span=Math.hypot(a*normal[0],b*normal[1]);
  const sides:[1,-1]=[1,-1];
  const lines=sides.map(sign=>{
    const k=base+sign*2*area,scaled=k/span;
    if(Math.abs(scaled)>1+1e-10)return {branch:sign,normal,constant:k,points:[]};
    const s=Math.max(-1,Math.min(1,scaled)),ortho=Math.sqrt(Math.max(0,1-s*s));
    const ux=a*normal[0]/span,uy=b*normal[1]/span;
    const pts=[1,-1].map(side=>({
      x:a*(ux*s+side*(-uy)*ortho),
      y:b*(uy*s+side*ux*ortho),
    }));
    return {branch:sign,normal,constant:k,points:ortho<1e-9?[pts[0]]:pts};
  });
  const candidates:ConicCandidate[]=lines.flatMap(line=>line.points.map(B=>{
    const dx=B.x-P.x,dy=B.y-P.y;
    return {branch:line.branch,point:B,vertical:Math.abs(dx)<1e-9,
      slope:Math.abs(dx)<1e-9?null:dy/dx,distanceFromP:Math.hypot(dx,dy)};
  }));
  const isOriginal=Math.abs(a2-12)<1e-9&&Math.abs(b2-9)<1e-9
    &&Math.abs(pointAngle-30)<1e-9&&Math.abs(area-9)<1e-9;
  const equation=`x²/${f(a2)}+y²/${f(b2)}=1`;
  const answerLines=isOriginal?"y=x/2；y=3x/2−3":candidates.length
    ?candidates.map(c=>c.vertical?"x="+f(P.x):`y−${f(P.y)}=${f(c.slope!)}(x−${f(P.x)})`).join("；")
    :"无满足面积约束的直线";
  const parts:ExamStep[]=[
    {title:"第（1）问 · 由已知点反求椭圆",kind:"proved",
      task:`椭圆 C：x²/a²+y²/b²=1（a>b>0）经过 A(0,${f(b)})、P(${f(P.x)},${f(P.y)})。求其方程和离心率。`,
      answer:`${equation}；e=${isOriginal?"1/2":f(ecc)}`,
      proof:`A 在上顶点，因此 b²=${f(b2)}；将 P 代入椭圆方程得 a²=${f(a2)}。由 c²=a²−b²，e=c/a=√(1−b²/a²)=${isOriginal?"1/2":f(ecc)}。`},
    {title:"第（2）问 · 面积约束反向求割线",kind:"proved",
      task:`过已知点 P 作直线，与 C 交于另一点 B；若 △ABP 的面积为 ${f(area)}，求所有可能的直线方程。不能遗漏竖直方向或无解分支。`,
      answer:answerLines,
      proof:`令 B=(x,y)，用面积公式 |(P−A)×(B−A)|/2=${f(area)}，即 |${f(normal[0])}x+${f(normal[1])}y−${f(base)}|=${f(2*area)}。它等价于两条与 AP 平行的候选位置直线（两种符号）。逐条与椭圆联立，只有实交点能作为 B；当前共获得 ${candidates.length} 个合格 B 位置，并将每个 B 与 P 连线去重得到上述斜率/竖直线方程。`},
  ];
  return {A,P,eccentricity:ecc,equation,
    candidateLines:lines,candidates,parts,isOriginal};
}

/** 2025 吉林中考数学第19题的三角形-移动正方形模型。
 * In normalized coordinates A=(0,0), B=(d,d), C=(L,0).
 * Original values d=3,L=7 imply AB=3√2, BC=5, ∠BAC=45°.
 */
export interface SquareInput { leg:number; base:number; movement:number }
export interface SquareOutput {
  A:Point;B:Point;C:Point;P:Point;D:Point;E:Point;
  intersection:Point[];area:number;totalArea:number;ac:number;bc:number;
  switchAt:number;centerAt:number;parts:ExamStep[];
}
export function analyzeSquare(input:SquareInput):SquareOutput {
  const {leg:d,base:L,movement:x}=input;
  valid(d,2,5,"构型腿长");
  valid(L,2*d+1,16,"三角形边 AC");
  valid(x,.5,L,"动点位置 AP");
  const A={x:0,y:0},B={x:d,y:d},C={x:L,y:0};
  const P={x,y:0},D={x,y:x},E={x:0,y:x};
  const bc=Math.hypot(L-d,d);
  const totalArea=L*d/2;
  const h=d*(L-x)/(L-d);
  const area=x<=d?x*x/2:totalArea-d*(L-x)**2/(2*(L-d));
  const intersection=x<=d?[A,P,D]:[A,P,{x,y:h},B];
  const origin=d===3&&L===7;
  const derivationAC=`已知 ∠BAC=45°、AB=${f(d)}√2、BC=${origin?"5":f(bc)}。由余弦定理 BC²=AB²+AC²−2·AB·AC·cos45°，化为 (AC−${f(d)})²=${f((L-d)**2)}。因本构型要求 C 在 B 向 x 轴投影点的右方且 AC>2·${f(d)}，故 AC=${f(L)}，排除另一代数根。`;
  const expression=`当 0<t≤${f(d)}，S(t)=t²/2；当 ${f(d)}<t≤${f(L)}，S(t)=${f(totalArea)}−${f(d)}/(2×${f(L-d)})·(${f(L)}−t)²。`;
  const stages:ExamStep[]=[
    {title:"第（1）问 · 勾股与余弦定理反求边长",kind:"proved",
      task:`在 △ABC 中，∠BAC=45°，AB=${f(d)}√2，BC=${origin?"5":f(bc)}，并取与图示一致的 C 所在分支，求 AC。`,
      answer:`AC=${f(L)}`,proof:derivationAC},
    {title:"第（2）问 · 相似三角形引出分段面积函数",kind:"proved",
      task:`点 P 从 A 沿 AC 向 C 运动，AP=t；以 AP 为边向 △ABC 内侧构造正方形 APDE。求正方形和 △ABC 的重叠面积 S(t)，并写出取值范围。`,
      answer:expression,
      proof:`当 t≤${f(d)}，重叠部分为直角三角形 APD，面积 t²/2。当 t>${f(d)}，作垂直于 AC 的直线 x=t，与 BC 交于 F。设 H 为 B 到 AC 的垂足，则 △CFP∽△CBH（CF 与 CB 共线，CP 与 CH 共线，且 ∠P=∠H=90°），可得 FP / ${f(d)}=(${f(L)}−t)/(${f(L)}−${f(d)})。故正方形内的重叠部分是 △ABC 去掉右侧 △CPF，其面积为 ${f(totalArea)}−${f(d)}/(2×${f(L-d)})(${f(L)}−t)²。两段在 t=${f(d)} 时均等于 ${f(d*d/2)}，连续但表达式不同。`},
    {title:"第（3）问 · 最后增加特殊位置条件定解",kind:"proved",
      task:"当正方形 APDE 的对称中心恰与点 B 重合时，求运动长度 AP。",
      answer:`AP=${f(2*d)}`,
      proof:`正方形中心为 (t/2,t/2)，题设 B=(${f(d)},${f(d)})，所以 t/2=${f(d)}，得 t=${f(2*d)}。因为 ${f(2*d)}<AC=${f(L)}，该解符合点 P 在线段 AC 内部的几何约束。`},
  ];
  return {A,B,C,P,D,E,intersection,area,totalArea,ac:L,bc,
    switchAt:d,centerAt:2*d,parts:stages};
}
