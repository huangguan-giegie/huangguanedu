import {compileDiagramProblem,type DiagramQuestion} from "./practice-diagram";
import {normalizeGeometryText} from "./latex-to-unicode";

/** Strict repair of one known legacy model-generated construction, never guess
 * at arbitrary figures. Old AI images were not checked against numeric angles.
 */
export function matchingLegacyDiameterProblem(question:string):DiagramQuestion|null{
 const q=normalizeGeometryText(question).replace(/\s+/g,"");
 if(!/四边形ABCD内接于/.test(q))return null;
 if(!/AB(?:是|为).{0,10}直径/.test(q))return null;
 if(!/求∠BAC/.test(q))return null;
 const match=q.match(/∠ADC[=＝](\d+(?:\.\d+)?)(?:°|度)/);
 if(!match)return null;
 const angle=Number(match[1]);
 if(!([110,120,125,130,140] as number[]).includes(angle))return null;
 return compileDiagramProblem({type:"circle_diameter_quadrilateral",angleADC:angle as 110|120|125|130|140});
}
