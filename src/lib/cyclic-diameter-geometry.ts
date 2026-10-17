/** Numeric Euclidean construction used by both diagram and answer checks.
 * A=(-r,0), B=(r,0), C is upper-right and D lies strictly on the minor arc AC.
 * This makes the specified ∠ADC obtuse; swapping C/D would falsify the premise.
 */
export type Point={x:number;y:number};
const rad=(degree:number)=>degree*Math.PI/180;
export function angleAt(a:Point,vertex:Point,b:Point):number{
 const u={x:a.x-vertex.x,y:a.y-vertex.y},v={x:b.x-vertex.x,y:b.y-vertex.y};
 const dp=u.x*v.x+u.y*v.y;
 const cp=u.x*v.y-u.y*v.x;
 return Math.atan2(Math.abs(cp),dp)*180/Math.PI;
}
export function cyclicDiameterGeometry(obtuseAngle:number,radius=100){
 if(!Number.isFinite(obtuseAngle)||obtuseAngle<=90||obtuseAngle>=180)throw Error("圆内接四边形∠ADC应为钝角");
 const target=obtuseAngle-90;
 const circle=(degrees:number):Point=>({x:radius*Math.cos(rad(degrees)),y:radius*Math.sin(rad(degrees))});
 // Inscribed angle at A intercepts the minor BC arc: central angle BOC = 2*BAC.
 const cAngle=2*target;
 const dAngle=(cAngle+180)/2;
 const A=circle(180),B=circle(0),C=circle(cAngle),D=circle(dAngle),O={x:0,y:0};
 const actual=angleAt(A,D,C),atC=angleAt(A,C,B),atA=angleAt(B,A,C);
 if(Math.abs(actual-obtuseAngle)>1e-8||Math.abs(atC-90)>1e-8||Math.abs(atA-target)>1e-8)
  throw Error("几何构造与题设角度不一致");
 return {A,B,C,D,O,radius,atD:actual,atC,atA};
}
export function detectLegacyCyclicDiameterQuestion(question:string):number|null{
 if(!/AB\s*(?:是|为|作为|系).{0,8}直径/.test(question))return null;
 if(!/圆内接|内接于|四边形\s*ABCD.{0,12}(?:圆|⊙)|四边形\s*ABCD内接于/.test(question))return null;
 if(!/求\s*∠?BAC/.test(question))return null;
 const angle=/∠\s*ADC\s*[＝=]\s*(11[0-9]|12[0-9]|13[0-9]|14[0-9])\s*°/.exec(question);
 if(!angle)return null;
 const value=Number(angle[1]);
 return value>90&&value<180?value:null;
}
