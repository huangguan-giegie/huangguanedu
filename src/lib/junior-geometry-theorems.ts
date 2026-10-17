export interface JuniorTheorem{
 id:string;name:string;formula:string;use:string;example:string;
 category:"三角形"|"圆"|"四边形"|"相似与比例"|"坐标";
}
export const JUNIOR_THEOREMS:readonly JuniorTheorem[]=[
 {id:"triangle-sum",name:"三角形内角和",formula:"∠A + ∠B + ∠C = 180°",use:"任意三角形",example:"若∠A=50°，∠B=60°，则∠C=70°",category:"三角形"},
 {id:"exterior-angle",name:"三角形外角定理",formula:"外角 = 两个不相邻内角之和",use:"三角形外角",example:"两个远端内角为40°、60°，外角为100°",category:"三角形"},
 {id:"pythagoras",name:"勾股定理",formula:"a² + b² = c²",use:"仅适用于直角三角形，c为斜边",example:"3²+4²=5²",category:"三角形"},
 {id:"bisector",name:"角平分线定理",formula:"BD / DC = AB / AC",use:"AD平分∠A，D在BC上",example:"AB:AC=2:3，则BD:DC=2:3",category:"三角形"},
 {id:"midline",name:"三角形中位线定理",formula:"MN ∥ BC，MN = BC / 2",use:"M、N是三角形两条边的中点",example:"BC=10，则MN=5",category:"三角形"},
 {id:"area-triangle",name:"三角形面积",formula:"S = 底 × 高 / 2",use:"高必须垂直于所选底边",example:"底8、高5，面积20",category:"三角形"},
 {id:"similarity",name:"相似三角形",formula:"AB / DE = AC / DF = BC / EF",use:"对应顶点A↔D、B↔E、C↔F",example:"放大2倍则各边均变2倍",category:"相似与比例"},
 {id:"circle-central",name:"圆周角定理",formula:"同弧圆周角 = 圆心角 / 2",use:"圆周角顶点在不含所截弧的圆弧上",example:"圆心角100°，圆周角50°",category:"圆"},
 {id:"circle-diameter",name:"直径所对圆周角",formula:"AB为直径 ⇒ ∠ACB = 90°",use:"C在圆上且C≠A、B",example:"∠ABC=55°，∠BAC=35°",category:"圆"},
 {id:"cyclic",name:"圆内接四边形对角互补",formula:"∠ABC + ∠ADC = 180°",use:"A、B、C、D为同一圆周上的四点",example:"∠ADC=125°，则∠ABC=55°",category:"圆"},
 {id:"tangent",name:"切线垂直半径",formula:"OA ⟂ PA",use:"PA在A处与圆O相切",example:"OA=3，PA=4，OP=5",category:"圆"},
 {id:"chord",name:"垂径定理",formula:"OH ⟂ AB ⇒ AH = HB",use:"O为圆心，H为弦AB的垂足",example:"半径5、圆心距3，则半弦4",category:"圆"},
 {id:"trapezoid",name:"梯形面积",formula:"S = (上底 + 下底) × 高 / 2",use:"两底平行且高垂直于两底",example:"上底6、下底10、高4，面积32",category:"四边形"},
 {id:"parallelogram",name:"平行四边形面积",formula:"S = 底 × 高",use:"高为两平行底边之间的垂直距离",example:"底7、高3，面积21",category:"四边形"},
 {id:"polygon-angle",name:"凸多边形内角和",formula:"(n − 2) × 180°",use:"简单凸n边形，n≥3",example:"五边形内角和540°",category:"四边形"},
 {id:"coordinate-mid",name:"线段中点公式",formula:"M = ((x₁+x₂)/2, (y₁+y₂)/2)",use:"平面直角坐标系",example:"(2,4)、(6,8)中点(4,6)",category:"坐标"},
 {id:"coordinate-dist",name:"两点间距离",formula:"AB = √((x₂−x₁)²+(y₂−y₁)²)",use:"平面直角坐标系",example:"(0,0)、(3,4)距离5",category:"坐标"},
];
export function filterTheorems(text:string,category:string){
 const search=text.trim().toLowerCase();
 return JUNIOR_THEOREMS.filter(t=>(category==="全部"||t.category===category)&&
  (!search||[t.name,t.formula,t.use,t.example].some(v=>v.toLowerCase().includes(search))));
}
