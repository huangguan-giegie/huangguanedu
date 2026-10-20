/**
 * Parameterized exam-type models inspired by published 2024-2025 中考 / 高考
 * structures (not transcriptions of copyrighted examination questions).
 * Only model-specific algebraic derivations certify a theorem or invariant;
 * floating-point explorations are labelled as approximate.
 */
import { conicEquation, conicValue, validateConic, type ConicKind, type ConicModel, type V2 } from "./exam-conics";

export type ExamQuestion = { question:string; answer:string; explanation:string; level:"中考"|"高考"; exact:boolean };
export type ExamResult = {
  status:string; target:string; value:string|null; invariant:boolean;
  degreesOfFreedom:number; conditions:string[]; notes:string[];
  points:V2[]; question:ExamQuestion|null;
};
const finite=(n:number,lo:number,hi:number,name:string)=>{
  if(!Number.isFinite(n)||n<lo||n>hi)throw Error(`${name}超出允许范围`);
  return n;
};
const fmt=(x:number)=>Math.abs(x)<1e-9?"0":Number(x.toFixed(5)).toString();
const approximate=(x:number)=>Number.isFinite(x)?`约 ${fmt(x)}`:"无定义";
const gcd=(a:number,b:number):number=>{a=Math.abs(a);b=Math.abs(b);while(b){const t=a%b;a=b;b=t;}return a||1;};
const fraction=(n:number,d:number):string=>{
  if(!Number.isInteger(n)||!Number.isInteger(d)||d===0)return fmt(n/d);
  const g=gcd(n,d),a=n/g,b=d/g;
  return b===1?String(a):`${a}/${b}`;
};
const squareRoot=(n:number):string=>Number.isInteger(Math.sqrt(n))?String(Math.sqrt(n)):`√${n}`;

export type SimilarityTarget="segment"|"area"|"trapezoid"|"ratio"|"fixedRatio";
export interface SimilarityInput {
  base:number; height:number; ad:number; lockD:boolean; target:SimilarityTarget;
  mode?:"parallel"|"rotate";rotation?:number;lockRotation?:boolean;
}
export function analyzeSimilarity(input:SimilarityInput):ExamResult {
  const {base,height,ad,lockD,target}=input;
  const mode=input.mode??"parallel", rotation=input.rotation??0;
  if(mode==="rotate")finite(rotation,0,180,"旋转角度");
  finite(base,3,16,"AB");finite(height,2,16,"AC");
  finite(ad,1,base-1,"AD");
  const bc=Math.hypot(base,height), scale=ad/base, de=scale*bc;
  const smallArea=ad*ad*height/(2*base), largeArea=base*height/2;
  const original=[`Rt△ABC 中 ∠A=90°，AB=${fmt(base)}，AC=${fmt(height)}`,
    ...(mode==="parallel" ? ["D 在 AB 上，E 在 AC 上，且 DE∥BC"] :
      ["△ADE∽△ABC（A、B、C 分别对应 A、D、E），以 A 为中心旋转缩放构造",
        ...(input.lockRotation?[`逆时针旋转角为 ${fmt(rotation)}°`]:[])])];
  const conditions=lockD?[...original,`AD=${fmt(ad)}`]:original;
  const targetNames:Record<SimilarityTarget,string>={
    segment:"DE 的长度",area:"△ADE 的面积",trapezoid:"四边形 BCED 的面积",
    ratio:"相似比 AD/AB",fixedRatio:"DE/AD 的定值",
  };
  const invalidTrapezoid=mode==="rotate"&&target==="trapezoid";
  const dynamic=(!lockD&&target!=="fixedRatio")||invalidTrapezoid;
  const raw={segment:de,area:smallArea,trapezoid:largeArea-smallArea,ratio:scale,fixedRatio:bc/base}[target];
  const radical=squareRoot(base*base+height*height);
  const exactSegment=Number.isInteger(base)&&Number.isInteger(ad)&&Number.isInteger(height)
    ? `${fraction(ad,base)}×${radical}` : approximate(de);
  const text:Record<SimilarityTarget,string>={
    segment:exactSegment,
    area:fmt(smallArea),
    trapezoid:fmt(largeArea-smallArea),
    ratio:fraction(ad,base),
    fixedRatio: `${radical}/${fmt(base)}`,
  };
  const steps=`由 DE∥BC 得 △ADE∽△ABC，所以 AD/AB=AE/AC=DE/BC=${fmt(ad)}/${fmt(base)}。BC=√(AB²+AC²)=${radical}；DE=${exactSegment}；S(ADE)=AD²×AC/(2AB)=${fmt(smallArea)}；S(BCED)=S(ABC)−S(ADE)=${fmt(largeArea-smallArea)}。`;
  const invariant=target==="fixedRatio";
  const question:ExamQuestion|null=dynamic?null:{
    level:"中考",
    question:mode==="parallel"
      ?`在 Rt△ABC 中，∠A=90°，AB=${fmt(base)}，AC=${fmt(height)}。D 在 AB 内，E 在 AC 内，且 DE∥BC${lockD?`，AD=${fmt(ad)}`:"，D 可以在 AB 上运动"}。求${targetNames[target]}。`
      :`已知 Rt△ABC，∠A=90°，AB=${fmt(base)}，AC=${fmt(height)}。△ADE∽△ABC（A、B、C 依次对应 A、D、E），以 A 为中心旋转缩放构造${lockD?`，AD=${fmt(ad)}`:"，AD 可变化"}${input.lockRotation?`，∠BAD=${fmt(rotation)}°`:""}。求${targetNames[target]}。`,
    answer:target==="fixedRatio"?text[target]:text[target],
    explanation: target==="fixedRatio"
      ?`由 △ADE∽△ABC，DE/AD=BC/AB。再由勾股定理 BC=${radical}，故 DE/AD=${text.fixedRatio}，与动点 D 的位置无关。`
      :steps,
    exact:target==="segment"||target==="fixedRatio"||Number.isInteger(raw),
  };
  const notes=[`△ADE∽△ABC，缩放比例 t=AD/AB=${fmt(scale)}；面积比为 t²=${fmt(scale*scale)}。`];
  if(mode==="rotate")notes.push("旋转构型允许 D、E 绕 A 共同转动；边长与面积不因旋转而改变。");
  if(invalidTrapezoid)notes.push("旋转后 BCED 一般不是梯形，不能沿用平行截线的梯形面积公式。");
  if(dynamic)notes.push("AD 未作为已知条件，动点位置变化将改变目标值，因此不能生成唯一数值答案。");
  if(invariant)notes.push("虽然 D 可以移动，但 DE/AD=BC/AB，与 AD 无关；这是目标量定值，而非图形定解。");
  return {status:dynamic?"目标随动点变化":invariant?"动点下仍为定值":"已满足定解条件",
    target:targetNames[target],value:dynamic?null:text[target],invariant,
    degreesOfFreedom:Number(!lockD)+Number(mode==="rotate"&&!input.lockRotation),conditions,notes,
    points:[{x:0,y:0},{x:base,y:0},{x:0,y:height},
      ...(mode==="parallel"?[{x:ad,y:0},{x:0,y:height*scale}]:[
        {x:ad*Math.cos(rotation*Math.PI/180),y:ad*Math.sin(rotation*Math.PI/180)},
        {x:-height*scale*Math.sin(rotation*Math.PI/180),y:height*scale*Math.cos(rotation*Math.PI/180)},
      ])],question};
}

export type QuadraticTarget="count"|"sum"|"chord"|"vertex"|"max"|"min"|"areaMax";
export interface QuadraticInput {
  a:number; h:number; v:number; slope:number; intercept:number;
  left:number; right:number; target:QuadraticTarget;movement?:number;
}
export interface QuadraticResult extends ExamResult {
  discriminant:number; roots:number[]; curve:(x:number)=>number;
  line:(x:number)=>number; critical:number|null;movingPoint:V2|null;
}
export function analyzeQuadratic(q:QuadraticInput):QuadraticResult {
  const {a,h,v,slope,intercept,left,right,target}=q;
  finite(a,-5,5,"二次项系数a");if(Math.abs(a)<1e-10)throw Error("二次项系数 a 不得为 0");
  [h,v,slope,intercept,left,right].forEach((n,i)=>finite(n,-20,20,`参数${i+1}`));
  if(left>=right)throw Error("区间左端必须小于右端");
  const A=a,B=-2*a*h-slope,C=a*h*h+v-intercept;
  const disc=B*B-4*A*C;
  const tolerance=1e-9*Math.max(1,Math.abs(B*B),Math.abs(4*A*C));
  const roots=disc < -tolerance?[]:Math.abs(disc)<=tolerance?[-B/(2*A)]
    :[(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)].sort((x,y)=>x-y);
  const curve=(x:number)=>a*(x-h)**2+v;
  const line=(x:number)=>slope*x+intercept;
  const movement=finite(q.movement??.5,0,1,"动点位置比例");
  const chosen=[left,right,...(h>=left&&h<=right?[h]:[])];
  const vals=chosen.map(x=>curve(x));
  const ymin=Math.min(...vals),ymax=Math.max(...vals);
  const counts=roots.length;
  const names:Record<QuadraticTarget,string>={
    count:"交点个数",sum:"两交点横坐标之和",chord:"两交点间弦长",
    vertex:"抛物线的顶点坐标",max:"指定闭区间的最大值",min:"指定闭区间的最小值",
    areaMax:"以两交点为底的动点三角形面积最大值",
  };
  const possible=!["sum","chord","areaMax"].includes(target)||counts===2;
  const chord=counts===2?Math.abs(roots[1]-roots[0])*Math.hypot(1,slope):null;
  const dx=counts===2?roots[1]-roots[0]:0;
  const areaMax=counts===2?Math.abs(a)*dx**3/8:null;
  const areaMaxExact=counts===2&&Number.isInteger(disc)&&Number.isInteger(Math.sqrt(disc))&&Number.isInteger(a)
    ? fraction(disc*Math.sqrt(disc),8*a*a):null;
  const movedX=counts===2?roots[0]+movement*dx:null;
  const movingPoint=movedX===null?null:{x:movedX,y:curve(movedX)};
  const currentArea=movedX===null?null:Math.abs(a)*dx/2*(movedX-roots[0])*(roots[1]-movedX);
  const value:Record<QuadraticTarget,string>={
    count:String(counts),sum:fmt(-B/A),chord:chord===null?"":approximate(chord),
    vertex:`(${fmt(h)}, ${fmt(v)})`,max:fmt(ymax),min:fmt(ymin),
    areaMax:areaMaxExact??approximate(areaMax??NaN),
  };
  const eq=`y=${fmt(a)}(x−(${fmt(h)}))²+${fmt(v)}`;
  const lineEq=`y=${fmt(slope)}x+${fmt(intercept)}`;
  const simple=`联立两函数，整理为 ${fmt(A)}x²+${fmt(B)}x+${fmt(C)}=0；判别式 Δ=${fmt(disc)}。`;
  const explain:Record<QuadraticTarget,string>={
    count:`${simple} Δ<0 无实交点，Δ=0 一个切点，Δ>0 两个交点，因此共有 ${counts} 个不同交点。`,
    sum:`${simple}由于 Δ>0，韦达定理得 x₁+x₂=−B/A=${fmt(-B/A)}。`,
    chord:`${simple}交点横坐标分别为 ${roots.map(fmt).join("、")}；弦长=√(1+m²)|x₂−x₁|=${approximate(chord??NaN)}。`,
    vertex:`二次函数为顶点式 ${eq}，顶点为 (${fmt(h)}, ${fmt(v)})。`,
    max:`在 [${fmt(left)}, ${fmt(right)}] 比较区间端点${h>=left&&h<=right?"及顶点":""}的函数值，最大为 ${fmt(ymax)}。`,
    min:`在 [${fmt(left)}, ${fmt(right)}] 比较区间端点${h>=left&&h<=right?"及顶点":""}的函数值，最小为 ${fmt(ymin)}。`,
    areaMax:`${simple}设交点横坐标 x₁=${fmt(roots[0]??0)},x₂=${fmt(roots[1]??0)}（x₁<x₂）。P=(t,f(t)) 在两交点间抛物线弧上运动，则 S(△ABP)=|a|(x₂−x₁)(t−x₁)(x₂−t)/2。由 (t−x₁)(x₂−t)≤(x₂−x₁)²/4，等号在 t=(x₁+x₂)/2 时成立，故 Smax=|a|(x₂−x₁)³/8=${areaMaxExact??approximate(areaMax??NaN)}。`,
  };
  const question:ExamQuestion|null=possible?{
    level:"中考",exact:target!=="chord"&&(target!=="areaMax"||areaMaxExact!==null),
    question:target==="vertex"?`已知二次函数 ${eq}，求顶点坐标。`
      :target==="areaMax"
        ?`抛物线 ${eq} 与直线 ${lineEq} 交于不同两点 A、B。动点 P 在 A、B 之间对应的一段抛物线上运动。求 △ABP 的面积最大值。`
      :target==="max"||target==="min"
        ?`已知二次函数 ${eq}，当 x∈[${fmt(left)}, ${fmt(right)}] 时，求函数的${target==="max"?"最大":"最小"}值。`
        :`二次函数 ${eq} 与直线 ${lineEq} 相交。求${names[target]}。`,
    answer:value[target],explanation:explain[target],
  }:null;
  return {status:counts===0?"两图像没有实交点":counts===1?"恰有一个切点":"两图像有两个不同交点",
    degreesOfFreedom:0,target:names[target],value:possible?value[target]:null,
    invariant:false,conditions:[eq,lineEq,...(["max","min"].includes(target)?[`x∈[${fmt(left)}, ${fmt(right)}]`]:[])],
    notes:[simple,...(currentArea===null?[]:[`当前动点 P 使 △ABP 面积约为 ${fmt(currentArea)}；滑动 P 可检验面积的最大值。`]),
      ...(!possible?["当前只有不足两个不同实交点，弦长/两交点横坐标和/动点面积最大值不适用。"]:[])],
    points:roots.map(x=>({x,y:curve(x)})),question,discriminant:disc,roots,curve,line,critical:h,movingPoint,
  };
}

export type NormalLine={through:V2;angle:number};
export type SectionStatus="none"|"tangent"|"secant"|"linear";
export interface ConicSection {
  status:SectionStatus;direction:V2;points:V2[];parameters:number[];
  A:number;B:number;C:number;discriminant:number|null;
  chord:number|null;midpoint:V2|null; product:number|null;
}
export function intersectGeneralConic(curve:ConicModel,line:NormalLine):ConicSection {
  validateConic(curve);
  const {x,y}=line.through;
  finite(x,-15,15,"固定点x");finite(y,-15,15,"固定点y");
  const rad=finite(line.angle,-360,360,"倾斜角")*Math.PI/180;
  const ux=Math.abs(Math.cos(rad))<1e-12?0:Math.cos(rad);
  const uy=Math.abs(Math.sin(rad))<1e-12?0:Math.sin(rad);
  const sign=curve.kind==="hyperbola"?-1:1;
  const A=curve.kind==="parabola"?uy*uy:ux*ux/(curve.a*curve.a)+sign*uy*uy/(curve.b*curve.b);
  const B=curve.kind==="parabola"?2*y*uy-4*curve.p*ux
    :2*x*ux/(curve.a*curve.a)+2*sign*y*uy/(curve.b*curve.b);
  const C=conicValue(curve,{x,y});
  const eps=1e-11*Math.max(1,Math.abs(B),Math.abs(C));
  let ts:number[]=[];
  let disc:number|null=null,linear=false;
  if(Math.abs(A)<=eps){
    linear=true;
    if(Math.abs(B)>eps)ts=[-C/B];
  }else{
    disc=B*B-4*A*C;
    const tolerance=1e-10*Math.max(1,Math.abs(B*B),Math.abs(4*A*C));
    if(disc>=-tolerance){
      if(Math.abs(disc)<=tolerance)ts=[-B/(2*A)];
      else {
        const sqrt=Math.sqrt(disc),q=-.5*(B+Math.sign(B||1)*sqrt);
        ts=q===0?[-B/(2*A)]:[q/A,C/q];
        ts.sort((a,b)=>a-b);
      }
    }
  }
  const points=ts.map(t=>({x:x+t*ux,y:y+t*uy}));
  const status:SectionStatus=points.length===2?"secant":points.length===0?"none":linear?"linear":"tangent";
  return {status, direction:{x:ux,y:uy},points,parameters:ts,A,B,C,
    discriminant:disc,chord:ts.length===2?Math.abs(ts[1]-ts[0]):null,
    midpoint:ts.length===2?{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}:null,
    product:ts.length===2?ts[0]*ts[1]:null};
}

export type ConicTarget="count"|"chord"|"midpoint"|"rootSum"|"discriminant";
export interface ConicInput {
  curve:ConicModel; through:V2; angle:number; target:ConicTarget;
}
export function analyzeConic(input:ConicInput):ExamResult&{section:ConicSection} {
  const section=intersectGeneralConic(input.curve,{through:input.through,angle:input.angle});
  const {through,angle,curve,target}=input;
  const names:Record<ConicTarget,string>={
    count:"交点个数",chord:"交点 A、B 形成的弦长",
    midpoint:"弦 AB 中点坐标",rootSum:"直线参数 t₁+t₂",discriminant:"联立方程判别式",
  };
  const ok=(target==="count")||(target==="discriminant"&&section.discriminant!==null)
    ||(["chord","midpoint","rootSum"].includes(target)&&section.status==="secant");
  const val:Record<ConicTarget,string>={
    count:String(section.points.length),
    chord:approximate(section.chord??NaN),
    midpoint:section.midpoint?`(${fmt(section.midpoint.x)}, ${fmt(section.midpoint.y)})`:"",
    rootSum:section.status==="secant"?fmt(-section.B/section.A):"",
    discriminant:section.discriminant===null?"":fmt(section.discriminant),
  };
  const eq=conicEquation(curve);
  const description=`过定点 P(${fmt(through.x)},${fmt(through.y)}) 且倾斜角为 ${fmt(angle)}° 的直线 l`;
  const substitution=`取单位方向向量 u=(cos${fmt(angle)}°,sin${fmt(angle)}°)，令 X=P+tu。联立圆锥曲线，得 ${fmt(section.A)}t²+${fmt(section.B)}t+${fmt(section.C)}=0。`;
  const proof=target==="count"?`计算实际实根个数为 ${section.points.length}（二次重根按一个点统计；降为一次方程时不视为相切）。`
    :target==="discriminant"?`按 Δ=B²−4AC 得 ${val.discriminant}。`
      :target==="rootSum"?`由韦达定理 t₁+t₂=−B/A=${val.rootSum}。`
        :target==="chord"?`u 为单位向量，故 |AB|=|t₂−t₁|=${val.chord}。`
          :`根据两交点的坐标平均数，M=${val.midpoint}。`;
  const question=ok?{
    level:"高考" as const,exact:target==="count",
    question:`已知圆锥曲线 C：${eq}，${description}。求${names[target]}。`,
    answer:val[target],
    explanation:substitution+proof+(target==="chord"||target==="midpoint"?" 坐标和长度结果按所列精度近似。":""),
  }:null;
  return {status:{none:"该直线无实交点",tangent:"该直线与曲线相切",secant:"该直线与曲线有两个交点",linear:"联立后降为一次方程（不是切线）"}[section.status],
    degreesOfFreedom:0,target:names[target],value:ok?val[target]:null,invariant:false,
    conditions:[eq,description],points:section.points,
    notes:[substitution,`Δ=${section.discriminant===null?"一次方程，无二次判别式":fmt(section.discriminant)}；交点数=${section.points.length}。`,
      ...(!ok?["当前不满足该目标的定义条件，不能生成有答案的试题。"]:[])],question,section};
}

export interface LineFamilyInput {
  curve:ConicModel; through:V2; angles:number[]; perpendicular:boolean;
  target:"reciprocal"|"chordSum"|"chordProduct";
}
export interface LineFamilyResult extends ExamResult {
  sections:ConicSection[]; certification:boolean;
}
export function analyzeLineFamily(c:LineFamilyInput):LineFamilyResult {
  if(c.angles.length<2||c.angles.length>4)throw Error("直线数必须为 2 至 4");
  const angles=c.angles.map(angle=>finite(angle,0,179,"直线方向"));
  const second=c.perpendicular?(angles[0]+90)%180:angles[1];
  const actual=[angles[0],second,...angles.slice(2)];
  const sections=actual.map(angle=>intersectGeneralConic(c.curve,{through:c.through,angle}));
  const allSecants=sections.every(s=>s.status==="secant");
  const inside=c.curve.kind==="ellipse"&&conicValue(c.curve,c.through)<-1e-8;
  const certified=c.perpendicular&&inside&&sections[0].status==="secant"&&sections[1].status==="secant"
    &&c.target==="reciprocal";
  const pair=sections.slice(0,2);
  const reciprocal=pair.every(s=>s.product!==null&&Math.abs(s.product)>1e-12)
    ?pair.reduce((sum,s)=>sum+1/Math.abs(s.product!),0):null;
  const chordSum=allSecants?sections.reduce((sum,s)=>sum+s.chord!,0):null;
  const chordProduct=allSecants?sections.reduce((product,s)=>product*s.chord!,1):null;
  const valueNum=c.target==="reciprocal"?reciprocal:c.target==="chordSum"?chordSum:chordProduct;
  const names={reciprocal:"1/(PA·PB)+1/(PC·PD)",chordSum:"全部弦长之和",chordProduct:"全部弦长之积"} as const;
  const d=1-c.through.x**2/(c.curve.a*c.curve.a)-c.through.y**2/(c.curve.b*c.curve.b);
  const certifiedValue=(1/(c.curve.a*c.curve.a)+1/(c.curve.b*c.curve.b))/d;
  const a2=c.curve.a*c.curve.a,b2=c.curve.b*c.curve.b;
  const fixedFraction=fraction(4*(a2+b2),4*a2*b2-(2*c.through.x)**2*b2-(2*c.through.y)**2*a2);
  const value=valueNum===null?null:certified?`${fixedFraction}（定值）`:approximate(valueNum);
  const conditions=[conicEquation(c.curve),`所有直线均经过 P(${fmt(c.through.x)},${fmt(c.through.y)})`,
    `直线方向：${actual.map(v=>`${fmt(v)}°`).join("、")}`,...(c.perpendicular?["第 1 与第 2 条直线互相垂直"]:[])];
  const proof=certified?`设 u₁=(cosθ,sinθ)，u₂=(-sinθ,cosθ)，分别以 P+tuᵢ 参数化两条直线。代入椭圆得 Aᵢt²+Bᵢt−D=0，其中 D=1−(Px²/a²+Py²/b²)=${fmt(d)}>0。由韦达定理，两交点参数积 t₁t₂=−D/Aᵢ；P 在椭圆内部，两交点位于 P 两侧，PA·PB=D/A₁，PC·PD=D/A₂。故所求倒数和=(A₁+A₂)/D=(1/a²+1/b²)/D=${fmt(certifiedValue)}。u₁、u₂ 正交，A₁+A₂ 与 θ 无关，故为定值，且精确值为 ${fixedFraction}。注意 A、B、C、D 在此表示两条直线各自的两个交点。`
    :`逐条将方向单位向量 uᵢ 代入 X=P+t uᵢ，与 ${conicEquation(c.curve)} 联立并求实根；弦长取 |t₂−t₁|。本配置得 ${value??"不存在可计算的目标"}。当前仅是给定直线方向的数值结果，未证明对方向改变仍为定值。`;
  const question=value!==null?{
    level:"高考" as const,exact:certified,
    question:certified?`已知椭圆 ${conicEquation(c.curve)} 内部定点 P(${fmt(c.through.x)},${fmt(c.through.y)})，过 P 作任意两条互相垂直的直线，分别与椭圆交于 A、B 和 C、D。证明 1/(PA·PB)+1/(PC·PD) 为定值，并求其值。`
      :`在 ${conicEquation(c.curve)} 上，过 P(${fmt(c.through.x)},${fmt(c.through.y)}) 作 ${actual.length} 条方向角分别为 ${actual.map(v=>`${fmt(v)}°`).join("、")} 的直线，并记各条直线与曲线的实交点。计算${names[c.target]}（若目标未定义需重新选参）。`,
    answer:value,explanation:proof,
  }:null;
  const notes=sections.map((s,i)=>`直线 ${i+1}：${fmt(actual[i])}°，${s.status==="secant"?"两个实交点":s.status==="tangent"?"相切":s.status==="linear"?"只有一个交点（非切线）":"无交点"}，弦长=${s.chord===null?"未定义":fmt(s.chord)}。`);
  if(c.target==="reciprocal"&&!inside)notes.push("证明定值需额外前提：椭圆且 P 严格位于椭圆内；双曲线、抛物线或外部 P 不适用本正交倒数定值公式。");
  if(c.target==="reciprocal"&&!c.perpendicular)notes.push("未限制两线互相垂直时，倒数和一般随方向变化，不能把一个数值当作定值证明。");
  if(certified)notes.push("可验证定值：正交单位向量的二次型系数和恒为 1/a²+1/b²。第三、第四条直线不参与这一定值。");
  return {status:value===null?"部分直线没有符合目标定义的两个交点":certified?"已经得到严格定值证明":"方向固定时可计算，未证明定值",
    degreesOfFreedom:c.perpendicular?1:2,invariant:certified,target:names[c.target],
    value,conditions,notes,question,points:sections.flatMap(s=>s.points),sections,certification:certified};
}
