import { z } from "zod";

/** A bounded, acyclic construction graph. Later objects can refer to earlier
 * objects only, so dragging parents always recomputes dependent geometry. */
const Identifier = z.string().regex(/^g[1-9][0-9]*$/);
const Base = { id: Identifier, label: z.string().min(1).max(12), hidden: z.boolean().optional() };
const Free = z.object({ ...Base, kind:z.literal("point"), x:z.number().finite().min(-1000).max(1000), y:z.number().finite().min(-1000).max(1000) }).strict();
const Meet = z.object({ ...Base, kind:z.literal("intersection"), first:Identifier, second:Identifier, solution:z.union([z.literal(0),z.literal(1)]) }).strict();
const Line = z.object({ ...Base, kind:z.enum(["line","segment"]), a:Identifier,b:Identifier }).strict();
const Circle = z.object({ ...Base, kind:z.literal("circle"),center:Identifier,through:Identifier }).strict();
const Polygon = z.object({...Base,kind:z.literal("polygon"),vertices:z.array(Identifier).min(3).max(30)}).strict();
const Locus = z.object({...Base,kind:z.literal("locus"),driver:Identifier,path:Identifier,target:Identifier,samples:z.number().int().min(24).max(160)}).strict();
export const GeometryObjectSchema=z.discriminatedUnion("kind",[Free,Meet,Line,Circle,Polygon,Locus]);
export const GeometryDocumentSchema=z.object({version:z.literal(1),objects:z.array(GeometryObjectSchema).max(250)}).strict();
export type GeometryObject=z.infer<typeof GeometryObjectSchema>;
export type GeometryDocument=z.infer<typeof GeometryDocumentSchema>;
export type Point={x:number;y:number};
export type Resolved = {
  object:GeometryObject;
  point?:Point;
  line?:{a:Point;b:Point};
  circle?:{center:Point;radius:number};
  polygon?:Point[];
};
export const EPS=1e-9;
const sq=(x:number)=>x*x;
const diff=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const add=(a:Point,v:Point,k=1):Point=>({x:a.x+v.x*k,y:a.y+v.y*k});
const finite=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const same=(a:Point,b:Point)=>dist(a,b)<EPS;
export const blankDocument=():GeometryDocument=>({version:1,objects:[]});
export const isShape=(v:GeometryObject):boolean=>v.kind==="line"||v.kind==="segment"||v.kind==="circle";
export const isPoint=(v:GeometryObject):boolean=>v.kind==="point"||v.kind==="intersection";

function references(v:GeometryObject):string[]{
  if(v.kind==="line"||v.kind==="segment")return [v.a,v.b];
  if(v.kind==="circle")return [v.center,v.through];
  if(v.kind==="intersection")return [v.first,v.second];
  if(v.kind==="polygon")return v.vertices;
  if(v.kind==="locus")return [v.driver,v.path,v.target];
  return [];
}
export function validateDocument(value:unknown):GeometryDocument{
  const doc=GeometryDocumentSchema.parse(value);
  const seen=new Map<string,GeometryObject>();
  for(const o of doc.objects){
    if(seen.has(o.id))throw Error("重复图形 ID："+o.id);
    for(const id of references(o)){
      const parent=seen.get(id);
      if(!parent)throw Error("引用不存在或构成循环："+id);
      if((o.kind==="line"||o.kind==="segment"||o.kind==="circle") &&
        parent.kind!=="point"&&parent.kind!=="intersection")throw Error("线/圆只能引用点");
      if(o.kind==="intersection"&&!isShape(parent))throw Error("交点只能引用两条线/圆");
      if(o.kind==="polygon"&&!isPoint(parent))throw Error("多边形顶点只能引用点");
      if(o.kind==="locus"&&((id===o.driver&&parent.kind!=="point")||(id===o.path&&!isShape(parent))||(id===o.target&&!isPoint(parent))))throw Error("轨迹必须引用自由驱动点、路径和目标点");
    }
    if((o.kind==="line"||o.kind==="segment")&&o.a===o.b)throw Error("两个端点不能相同");
    if(o.kind==="circle"&&o.center===o.through)throw Error("圆心和圆周点不能相同");
    if(o.kind==="intersection"&&o.first===o.second)throw Error("交点须来自不同对象");
    if(o.kind==="polygon"&&new Set(o.vertices).size!==o.vertices.length)throw Error("多边形顶点不能重复");
    if(o.kind==="locus"){
      const ancestors=(id:string,visited=new Set<string>()):Set<string>=>{for(const ref of references(seen.get(id)!)){if(!visited.has(ref)){visited.add(ref);ancestors(ref,visited);}}return visited;};
      if(!ancestors(o.target).has(o.driver))throw Error("目标点必须依赖驱动点");
      if(ancestors(o.path).has(o.driver))throw Error("驱动路径不能依赖自身");
    }
    seen.set(o.id,o);
  }
  return doc;
}
function lineLine(A:{a:Point;b:Point},B:{a:Point;b:Point}):Point[]{
  const r=diff(A.b,A.a),s=diff(B.b,B.a),den=cross(r,s);
  if(Math.abs(den)<EPS)return [];
  const t=cross(diff(B.a,A.a),s)/den;
  const p=add(A.a,r,t);
  return finite(p)?[p]:[];
}
function lineCircle(line:{a:Point;b:Point},circle:{center:Point;radius:number}):Point[]{
  const v=diff(line.b,line.a),f=diff(line.a,circle.center);
  const a=dot(v,v), b=2*dot(f,v),c=dot(f,f)-sq(circle.radius);
  if(a<EPS)return [];
  const discr=b*b-4*a*c;
  const tol=EPS*Math.max(1,Math.abs(b*b),Math.abs(4*a*c));
  if(discr < -tol)return [];
  const root=Math.sqrt(Math.max(0,discr));
  const ts=Math.abs(discr)<=tol?[-b/(2*a)]:[(-b-root)/(2*a),(-b+root)/(2*a)];
  return ts.map(t=>add(line.a,v,t)).filter(finite);
}
function circleCircle(A:{center:Point;radius:number},B:{center:Point;radius:number}):Point[]{
  const d=dist(A.center,B.center),r=A.radius,R=B.radius;
  if(d<EPS || d>r+R+EPS || d<Math.abs(r-R)-EPS)return [];
  const a=(r*r-R*R+d*d)/(2*d);
  const h2=r*r-a*a;
  if(h2 < -EPS*Math.max(1,r*r))return [];
  const u={x:(B.center.x-A.center.x)/d,y:(B.center.y-A.center.y)/d};
  const foot=add(A.center,u,a);
  const h=Math.sqrt(Math.max(0,h2));
  const normal={x:-u.y,y:u.x};
  const first=add(foot,normal,h);
  return h2<=EPS*Math.max(1,r*r)?[first]:[first,add(foot,normal,-h)];
}
/** Lines are infinite, segments are clipped to their endpoints. */
function insideSegment(p:Point,o:Resolved):boolean{
  if(o.object.kind!=="segment")return true;
  if(!o.line)return false;
  const v=diff(o.line.b,o.line.a),w=diff(p,o.line.a);
  const vv=dot(v,v);
  const t=dot(v,w)/vv;
  return vv>EPS&&t>=-EPS&&t<=1+EPS&&Math.abs(cross(v,w))<EPS*Math.max(1,vv);
}
export function intersections(A:Resolved,B:Resolved):Point[]{
  const values = A.line&&B.line?lineLine(A.line,B.line):
    A.line&&B.circle?lineCircle(A.line,B.circle):
    A.circle&&B.line?lineCircle(B.line,A.circle):
    A.circle&&B.circle?circleCircle(A.circle,B.circle):[];
  return values.filter(p=>insideSegment(p,A)&&insideSegment(p,B));
}
export function resolveDocument(document:GeometryDocument):Resolved[]{
  const resolved=new Map<string,Resolved>(),out:Resolved[]=[];
  for(const object of document.objects){
    const item:Resolved={object};
    if(object.kind==="point")item.point={x:object.x,y:object.y};
    else if(object.kind==="intersection"){
      const A=resolved.get(object.first),B=resolved.get(object.second);
      if(A&&B)item.point=intersections(A,B)[object.solution];
    }else if(object.kind==="polygon"){
      const vertices=object.vertices.map(id=>resolved.get(id)?.point);
      if(vertices.every((p):p is Point=>Boolean(p))&&validSimplePolygon(vertices as Point[]))item.polygon=vertices as Point[];
    }else if(object.kind==="locus"){
      // Locus is sampled in the UI with the validated construction graph, not recursively here.
    }else if(object.kind==="circle"){
      const a=resolved.get(object.center)?.point,b=resolved.get(object.through)?.point;
      if(a&&b&&dist(a,b)>EPS)item.circle={center:a,radius:dist(a,b)};
    }else{
      const a=resolved.get(object.a)?.point,b=resolved.get(object.b)?.point;
      if(a&&b&&dist(a,b)>EPS)item.line={a,b};
    }
    resolved.set(object.id,item);
    out.push(item);
  }
  return out;
}
function orient(a:Point,b:Point,c:Point):number{return cross(diff(b,a),diff(c,a));}
function onSegment(a:Point,b:Point,p:Point):boolean{
 return Math.abs(orient(a,b,p))<=EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&
  p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
}
function segmentsTouch(a:Point,b:Point,c:Point,d:Point):boolean{
 const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
 if(o1*o2<-EPS&&o3*o4<-EPS)return true;
 return (Math.abs(o1)<=EPS&&onSegment(a,b,c))||(Math.abs(o2)<=EPS&&onSegment(a,b,d))||
   (Math.abs(o3)<=EPS&&onSegment(c,d,a))||(Math.abs(o4)<=EPS&&onSegment(c,d,b));
}
export function polygonMeasures(points:Point[]):{area:number;perimeter:number}{
 const twiceArea=points.reduce((sum,p,i)=>sum+cross(p,points[(i+1)%points.length]),0);
 const perimeter=points.reduce((sum,p,i)=>sum+dist(p,points[(i+1)%points.length]),0);
 return {area:Math.abs(twiceArea)/2,perimeter};
}
export function validSimplePolygon(points:Point[]):boolean{
 const n=points.length;
 if(n<3||n>30||points.some(p=>!finite(p)))return false;
 const measure=polygonMeasures(points);
 if(measure.area<=EPS)return false;
 for(let i=0;i<n;i++){
  if(dist(points[i],points[(i+1)%n])<EPS)return false;
  for(let j=i+1;j<n;j++){
   if((j===i+1)||(i===0&&j===n-1))continue;
   if(segmentsTouch(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))return false;
  }
 }
 return true;
}
export function createPolygon(doc:GeometryDocument,vertices:string[]):{document:GeometryDocument;id:string}{
 if(vertices.length<3||vertices.length>30||new Set(vertices).size!==vertices.length)throw Error("多边形须由 3–30 个不同顶点构成");
 const items=new Map(resolveDocument(doc).map(v=>[v.object.id,v]));
 const points=vertices.map(id=>items.get(id)?.point);
 if(points.some(p=>!p)||!validSimplePolygon(points as Point[]))throw Error("多边形须为非自交、非退化的闭合折线");
 const id=nextId(doc);
 return {document:addObject(doc,{id,label:"poly"+id.slice(1),kind:"polygon",vertices}),id};
}
export function createLocus(doc:GeometryDocument,driver:string,path:string,target:string,samples=96):{document:GeometryDocument;id:string}{
 const id=nextId(doc);
 const next=addObject(doc,{id,label:"locus"+id.slice(1),kind:"locus",driver,path,target,samples});
 return {document:next,id};
}
export function nextId(document:GeometryDocument):string{
  return "g"+(document.objects.reduce((max,o)=>Math.max(max,Number(o.id.slice(1))),0)+1);
}
function addObject(document:GeometryDocument,o:GeometryObject):GeometryDocument{
  return validateDocument({version:1,objects:[...document.objects,o]});
}
export function createPoint(doc:GeometryDocument,p:Point):{document:GeometryDocument;id:string}{
  if(!finite(p)||Math.abs(p.x)>1000||Math.abs(p.y)>1000)throw Error("坐标超出范围");
  const id=nextId(doc);
  return {document:addObject(doc,{id,kind:"point",label:"P"+id.slice(1),x:p.x,y:p.y}),id};
}
export function createShape(doc:GeometryDocument,kind:"line"|"segment"|"circle",a:string,b:string):{document:GeometryDocument;id:string}{
  const items=resolveDocument(doc),map=new Map(items.map(o=>[o.object.id,o]));
  const A=map.get(a)?.point,B=map.get(b)?.point;
  if(!A||!B||same(A,B))throw Error("请选择两个不同且有效的点");
  const id=nextId(doc),label=(kind==="circle"?"c":kind==="segment"?"s":"l")+id.slice(1);
  const object:GeometryObject=kind==="circle"
    ?{id,label,kind,center:a,through:b}:{id,label,kind,a,b};
  return {document:addObject(doc,object),id};
}
export function createIntersections(doc:GeometryDocument,a:string,b:string):{document:GeometryDocument;ids:string[]} {
  const items=resolveDocument(doc), map=new Map(items.map(o=>[o.object.id,o]));
  const A=map.get(a),B=map.get(b);
  if(!A||!B||!isShape(A.object)||!isShape(B.object)||a===b)throw Error("请选择两条不同的线或圆");
  const pts=intersections(A,B);
  if(!pts.length)throw Error("对象当前无有限交点（平行、重合或相离）");
  let working=doc;
  const ids:string[]=[];
  for(let i=0;i<pts.length;i++){
    const reverseIndex=intersections(B,A).findIndex(p=>same(p,pts[i]));
    const exists=working.objects.some(o=>o.kind==="intersection"&&
      ((o.first===a&&o.second===b&&o.solution===i) ||
       (o.first===b&&o.second===a&&o.solution===reverseIndex)));
    if(exists)continue;
    const id=nextId(working);
    working=addObject(working,{id,label:"I"+id.slice(1),kind:"intersection",first:a,second:b,solution:i as 0|1});
    ids.push(id);
  }
  return {document:working,ids};
}
export function movePoint(doc:GeometryDocument,id:string,p:Point):GeometryDocument{
  if(!finite(p)||Math.abs(p.x)>1000||Math.abs(p.y)>1000)throw Error("坐标超出范围");
  const found=doc.objects.find(o=>o.id===id);
  if(!found||found.kind!=="point")throw Error("只有自由点可以移动");
  return validateDocument({...doc,objects:doc.objects.map(o=>o.id===id?{...o,x:p.x,y:p.y}:o)});
}
/** Edit a defining distance by changing an independent FREE through/endpoint
 * without severing a dependency graph. If the endpoint is constrained, reject
 * instead of pretending a change succeeded. */
export function resizeMeasuredObject(doc:GeometryDocument,id:string,length:number):GeometryDocument{
 if(!Number.isFinite(length)||length<=0||length>500)throw Error("长度或半径需大于0且不超过500");
 const object=doc.objects.find(o=>o.id===id);
 if(!object||!(object.kind==="circle"||object.kind==="segment"||object.kind==="line"))
  throw Error("请选择直线、线段或圆来编辑度量");
 const rendered=resolveDocument(doc);
 const current=rendered.find(o=>o.object.id===id);
 if(!current)throw Error("无法解析选定对象");
 const base=object.kind==="circle"?current.circle?.center:current.line?.a;
 const endpoint=object.kind==="circle"
   ?doc.objects.find(o=>o.id===object.through)
   :doc.objects.find(o=>o.id===object.b);
 const point=endpoint && rendered.find(o=>o.object.id===endpoint.id)?.point;
 if(!base||!point||!endpoint)throw Error("对象尚无有效的两个定位点");
 if(endpoint.kind!=="point")throw Error("定位末端是关联交点，不能直接改写；请先调整上游自由点");
 const currentLength=Math.hypot(point.x-base.x,point.y-base.y);
 if(currentLength<=EPS)throw Error("两定位点重合，无法确定方向");
 const ratio=length/currentLength;
 const updated={x:base.x+(point.x-base.x)*ratio,y:base.y+(point.y-base.y)*ratio};
 return movePoint(doc,endpoint.id,updated);
}
export function renameObject(doc:GeometryDocument,id:string,label:string):GeometryDocument {
  const value=label.trim();
  if(!value||value.length>12)throw Error("标签长度限制为 1–12");
  return validateDocument({...doc,objects:doc.objects.map(o=>o.id===id?{...o,label:value}:o)});
}
export function hideObject(doc:GeometryDocument,id:string,hidden:boolean):GeometryDocument{
  return validateDocument({...doc,objects:doc.objects.map(o=>o.id===id?{...o,hidden}:o)});
}
export function deleteCascade(doc:GeometryDocument,id:string):GeometryDocument{
  const removed=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    for(const o of doc.objects)if(!removed.has(o.id)&&references(o).some(ref=>removed.has(ref))){
      removed.add(o.id);changed=true;
    }
  }
  return validateDocument({version:1,objects:doc.objects.filter(o=>!removed.has(o.id))});
}
export function parseDocumentJSON(text:string):GeometryDocument{
  if(text.length>150000)throw Error("文件过大");
  return validateDocument(JSON.parse(text) as unknown);
}
export function starterDocument():GeometryDocument{
  let doc=blankDocument();
  const a=createPoint(doc,{x:-4,y:-2});doc=a.document;
  const b=createPoint(doc,{x:4,y:2});doc=b.document;
  const c=createPoint(doc,{x:-1,y:1});doc=c.document;
  const d=createPoint(doc,{x:2,y:1});doc=d.document;
  const l=createShape(doc,"line",a.id,b.id);doc=l.document;
  const circle=createShape(doc,"circle",c.id,d.id);doc=circle.document;
  return doc;
}
