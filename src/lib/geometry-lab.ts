import {
  constructExternalTangent, constructSimilarity, distance, verifyBisector,
  type BisectorConstruction, type ExternalTangentConstruction, type Point2,
  type SimilarityConstruction,
} from "./practice-construction-constraints";

/**
 * These are local exploratory controls, never quiz or persistence fields.
 * Drags are projected onto a valid parameter domain before we construct.
 */
export type LabMode = "bisector" | "similarity" | "tangent";
export type LabHandle = "A" | "B" | "C" | "E" | "O2" | "R" | "r";
export interface BisectorLabState { x: number; y: number }
export interface SimilarityLabState { base: number; height: number; factor: number }
export interface TangentLabState { R: number; r: number; d: number }

export const LAB_DEFAULTS: {
  bisector: BisectorLabState; similarity: SimilarityLabState; tangent: TangentLabState;
} = {
  bisector: { x: 4.3, y: 6.1 },
  similarity: { base: 4, height: 5, factor: 2 },
  tangent: { R: 5, r: 2, d: 12 },
};

const bounded = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value * 100) / 100)) : min;
export function displayMeasure(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\\.00$/, "").replace(/(\\.\\d)0$/, "$1");
}

export const SCENE = {
  width: 720, height: 420,
  bisector: { originX: 95, originY: 348, unit: 43, base: 12 },
  similarity: { leftX: 80, rightX: 355, originY: 348, unit: 20 },
  tangent: { originX: 152, originY: 248, unit: 22 },
} as const;

export function projectBisector(p: Point2): Point2 {
  const s = SCENE.bisector;
  return { x:s.originX + p.x*s.unit, y:s.originY - p.y*s.unit };
}
export function worldBisector(p: Point2): Point2 {
  const s=SCENE.bisector;
  return { x:(p.x-s.originX)/s.unit, y:(s.originY-p.y)/s.unit };
}
export function projectSimilarity(p: Point2, big = false): Point2 {
  const s=SCENE.similarity;
  return { x:(big?s.rightX:s.leftX)+p.x*s.unit, y:s.originY-p.y*s.unit };
}
export function worldSimilarity(p: Point2, big = false): Point2 {
  const s=SCENE.similarity;
  return { x:(p.x-(big?s.rightX:s.leftX))/s.unit, y:(s.originY-p.y)/s.unit };
}
export function projectTangent(p: Point2): Point2 {
  const s=SCENE.tangent;
  return { x:s.originX+p.x*s.unit, y:s.originY-p.y*s.unit };
}
export function worldTangent(p: Point2): Point2 {
  const s=SCENE.tangent;
  return { x:(p.x-s.originX)/s.unit, y:(s.originY-p.y)/s.unit };
}

export function normalizeBisector(state: BisectorLabState): BisectorLabState {
  return { x:bounded(state.x,1.25,10.75), y:bounded(state.y,1.75,7.75) };
}
export function normalizeSimilarity(state: SimilarityLabState): SimilarityLabState {
  return {
    base:bounded(state.base,2,7),
    height:bounded(state.height,2,7),
    factor:bounded(state.factor,1.2,2.4),
  };
}
export function normalizeTangent(state: TangentLabState): TangentLabState {
  const R=bounded(state.R,3,7);
  const r=bounded(state.r,1,R-0.7);
  const d=bounded(state.d, R+r+0.4,17);
  return {R,r,d};
}

export function bisectorLabGeometry(state: BisectorLabState): BisectorConstruction {
  const {x,y}=normalizeBisector(state);
  const B={x:0,y:0}, C={x:SCENE.bisector.base,y:0}, A={x,y};
  const AB=distance(A,B), AC=distance(A,C), BC=SCENE.bisector.base;
  const D={x:BC*AB/(AB+AC),y:0};
  const g={A,B,C,D,AB,AC,BC};
  verifyBisector(g);
  return g;
}
export function similarityLabGeometry(state: SimilarityLabState): SimilarityConstruction {
  const s=normalizeSimilarity(state);
  return constructSimilarity(s.base,s.height,s.factor);
}
export function tangentLabGeometry(state: TangentLabState): ExternalTangentConstruction {
  const s=normalizeTangent(state);
  return constructExternalTangent(s.R,s.r,s.d);
}

/** Convert an SVG pointer coordinate into one changed parameter.
 * Mouse and touch are handled by the UI; pure math here is separately testable.
 */
export function dragBisector(state: BisectorLabState, handle: LabHandle, screen: Point2): BisectorLabState {
  if (handle!=="A") return state;
  const {x,y}=worldBisector(screen);
  return normalizeBisector({x,y});
}
export function dragSimilarity(state: SimilarityLabState, handle: LabHandle, screen: Point2): SimilarityLabState {
  if (handle==="B") return normalizeSimilarity({...state,base:worldSimilarity(screen).x});
  if (handle==="C") return normalizeSimilarity({...state,height:worldSimilarity(screen).y});
  if (handle==="E") return normalizeSimilarity({...state,factor:worldSimilarity(screen,true).x/state.base});
  return state;
}
export function dragTangent(state: TangentLabState, handle: LabHandle, screen: Point2): TangentLabState {
  if (handle==="O2") return normalizeTangent({...state,d:worldTangent(screen).x});
  if (handle==="R") return normalizeTangent({...state,R:worldTangent(screen).y});
  if (handle==="r") return normalizeTangent({...state,r:worldTangent(screen).y});
  return state;
}
