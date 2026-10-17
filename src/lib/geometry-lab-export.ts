import {
  blankDocument,createPoint,createShape,renameObject,type GeometryDocument,type Point,
} from "./free-geometry";
import {
  bisectorLabGeometry,similarityLabGeometry,tangentLabGeometry,
  type BisectorLabState,type SimilarityLabState,type TangentLabState,
} from "./geometry-lab";
import {cyclicDiameterGeometry} from "./cyclic-diameter-geometry";

type Model=
  |{mode:"bisector";state:BisectorLabState}
  |{mode:"similarity";state:SimilarityLabState}
  |{mode:"tangent";state:TangentLabState}
  |{mode:"cyclic";angle:number};

function writer(){
 let document=blankDocument();
 const ids=new Map<string,string>();
 const point=(label:string,p:Point)=>{
  const created=createPoint(document,p);
  document=renameObject(created.document,created.id,label);
  ids.set(label,created.id);
 };
 const shape=(kind:"line"|"segment"|"circle",a:string,b:string)=>{
  const idA=ids.get(a),idB=ids.get(b);
  if(!idA||!idB)throw Error("几何导出缺少必要端点");
  document=createShape(document,kind,idA,idB).document;
 };
 return {point,shape,finish:():GeometryDocument=>document};
}
export function exportGeometryLabModel(model:Model):GeometryDocument{
 const w=writer();
 if(model.mode==="bisector"){
  const g=bisectorLabGeometry(model.state);
  for(const name of ["A","B","C","D"] as const)w.point(name,g[name]);
  for(const [a,b] of [["A","B"],["A","C"],["B","C"],["A","D"]] as const)w.shape("segment",a,b);
 }else if(model.mode==="similarity"){
  const g=similarityLabGeometry(model.state);
  for(const name of ["A","B","C"] as const)w.point(name,g.small[name]);
  // Translate larger triangle to avoid overlapping small triangle.
  for(const name of ["D","E","F"] as const){
   const p=g.large[name];w.point(name,{x:p.x+12,y:p.y});
  }
  for(const [a,b] of [["A","B"],["B","C"],["A","C"],["D","E"],["E","F"],["D","F"]] as const)w.shape("segment",a,b);
 }else if(model.mode==="tangent"){
  const g=tangentLabGeometry(model.state);
  for(const name of ["O1","O2","A","B"] as const)w.point(name,g[name]);
  w.shape("circle","O1","A");w.shape("circle","O2","B");
  w.shape("segment","A","B");w.shape("segment","O1","O2");
  w.shape("segment","O1","A");w.shape("segment","O2","B");
 }else{
  const g=cyclicDiameterGeometry(model.angle,6);
  for(const name of ["A","B","C","D","O"] as const)w.point(name,g[name]);
  w.shape("circle","O","A");
  for(const [a,b] of [["A","B"],["A","C"],["B","C"],["A","D"],["C","D"],["B","D"]] as const)w.shape("segment",a,b);
 }
 return w.finish();
}
