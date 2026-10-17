import {resolveDocument,polygonMeasures,type GeometryDocument} from "./free-geometry";
export type GeometryMeasurement={id:string;label:string;value:number;expression:string;unit:string};
const finite=(v:number)=>Number.isFinite(v)&&v>=0&&v<1e7;
export function geometryMeasurements(doc:GeometryDocument):GeometryMeasurement[]{
 const items=resolveDocument(doc);
 const measures:GeometryMeasurement[]=[];
 for(const item of items){
  const {object}=item;
  if(item.line&&object.kind==="segment"){
   const {a,b}=item.line;
   const length=Math.hypot(a.x-b.x,a.y-b.y);
   if(finite(length))measures.push({id:object.id,label:object.label+" 长度",value:length,expression:length.toFixed(4),unit:"单位"});
  }
  if(item.circle){
   const r=item.circle.radius;
   if(finite(r))measures.push({id:object.id,label:object.label+" 半径",value:r,expression:r.toFixed(4),unit:"单位"});
  }
  if(item.polygon){
   const m=polygonMeasures(item.polygon);
   if(finite(m.area))measures.push({id:object.id+"-area",label:object.label+" 面积",value:m.area,expression:m.area.toFixed(4),unit:"单位²"});
   if(finite(m.perimeter))measures.push({id:object.id+"-perimeter",label:object.label+" 周长",value:m.perimeter,expression:m.perimeter.toFixed(4),unit:"单位"});
  }
 }
 return measures.slice(0,40);
}
