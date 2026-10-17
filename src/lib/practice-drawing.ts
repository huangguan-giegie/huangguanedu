import { z } from "zod";
import { GeometryDocumentSchema,validateDocument,type GeometryDocument } from "./free-geometry";
import {PracticeDiagramSchema,type PracticeDiagram} from "./practice-diagram";

/** Explicitly separate student/teacher constructed artwork from the
 * authoritatively compiled question/answer diagram. A custom drawing is never
 * allowed to override the mathematical answer. */
const PackageSchema=z.object({
 type:z.literal("construction_attachment"),
 original:PracticeDiagramSchema.nullable(),
 drawing:GeometryDocumentSchema,
}).strict();
export function packPracticeDrawing(existing:unknown,drawing:GeometryDocument){
 const current=unpackPracticeDrawing(existing);
 return PackageSchema.parse({type:"construction_attachment",original:current.original,drawing:validateDocument(drawing)});
}
export function unpackPracticeDrawing(value:unknown):{
 original:PracticeDiagram|null;drawing:GeometryDocument|null;
}{
 const packed=PackageSchema.safeParse(value);
 if(packed.success)return {original:packed.data.original,drawing:packed.data.drawing};
 const ordinary=PracticeDiagramSchema.safeParse(value);
 return {original:ordinary.success?ordinary.data:null,drawing:null};
}
export const GEOMETRY_DRAFT_KEY="hg-academy-geometry-draft-v1";
export function geometryDraftExport(doc:GeometryDocument):string{
 return JSON.stringify(validateDocument(doc));
}
export function geometryDraftImport(raw:string):GeometryDocument{
 if(raw.length>150000)throw Error("图形 JSON 超过 150KB 限制");
 return validateDocument(JSON.parse(raw));
}
