import { z } from "zod";

/** A bounded, acyclic construction graph. Later objects can refer to earlier
 * objects only, so dragging parents always recomputes dependent geometry. */
const Identifier = z.string().regex(/^g[1-9][0-9]*$/);
const Base = { id: Identifier, label: z.string().min(1).max(12), hidden: z.boolean().optional() };
const Free = z.object({ ...Base, kind:z.literal("point"), x:z.number().finite().min(-1000).max(1000), y:z.number().finite().min(-1000).max(1000) }).strict();
const Meet = z.object({ ...Base, kind:z.literal("intersection"), first:Identifier, second:Identifier, solution:z.union([z.literal(0),z.literal(1)]) }).strict();
const Line = z.object({ ...Base, kind:z.enum(["line","segment"]), a:Identifier,b:Identifier }).strict();
const Circle = z.object({ ...Base, kind:z.literal("circle"),center:Identifier,through:Identifier }).strict();
export const GeometryObjectSchema=z.discriminatedUnion("kind",[Free,Meet,Line,Circle]);
export const GeometryDocumentSchema=z.object({version:z.literal(1),objects:z.array(GeometryObjectSchema).max(250)}).strict();
export type GeometryObject=z.infer<typeof GeometryObjectSchema>;
export type GeometryDocument=z.infer<typeof GeometryDocumentSchema>;
export type Point={x:number;y:number};
export type Resolved = {
  object:GeometryObject;
  point?:Point;
  line?:{a:Point;b:Point};
  circle?:{center:Point;radius:number};
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

function references(v:GeometryObject):string[]{
  if(v.kind==="line"||v.kind==="segment")return [v.a,v.b];
  if(v.kind==="circle")return [v.center,v.through];
  if(v.kind==="intersection")return [v.first,v.second];
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
    }
    if((o.kind==="line"||o.kind==="segment")&&o.a===o.b)throw Error("两个端点不能相同");
    if(o.kind==="circle"&&o.center===o.through)throw Error("圆心和圆周点不能相同");
    if(o.kind==="intersection"&&o.first===o.second)throw Error("交点须来自不同对象");
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
