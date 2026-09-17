export type Point = { x: number; y: number };
export type Line = { start: Point; end: Point };

export type GeometryObject =
  | { id: string; kind: "point"; point: Point }
  | { id: string; kind: "line" | "segment"; start: string | Point; end: string | Point }
  | { id: string; kind: "triangle"; points: [string | Point, string | Point, string | Point] }
  | { id: string; kind: "rectangle"; corner: Point; width: number; height: number }
  | { id: string; kind: "square"; corner: Point; side: number }
  | { id: string; kind: "circle"; center: string | Point; radius: number }
  | { id: string; kind: "label"; text: string; at: string | Point }
  | { id: string; kind: "helper-line"; start: string | Point; end: string | Point }
  | { id: string; kind: "formula"; tex: string; at: string | Point };

export type GeometryAction =
  | { type: "draw"; objectId: string; duration: number; start?: number }
  | { type: "move-point"; objectId: string; to: Point; duration: number; start?: number }
  | { type: "rotate"; objectIds: string[]; center: Point; angle: number; duration: number; start?: number }
  | { type: "reflect"; objectIds: string[]; axis: Line; duration: number; start?: number }
  | { type: "construct-parallel"; sourceId: string; through: string; resultId: string; duration: number; start?: number }
  | { type: "construct-perpendicular"; sourceId: string; through: string; resultId: string; duration: number; start?: number }
  | { type: "highlight"; objectIds: string[]; duration: number; start?: number }
  | { type: "fill"; objectId: string; color: string; duration: number; start?: number }
  | { type: "trace"; objectId: string; duration: number; start?: number }
  | { type: "transform-formula"; from: string; to: string; duration: number; start?: number }
  | { type: "unsupported"; name: string; duration: number; start?: number };

export type GeometryProgram = {
  canvas: { width: 1080; height: 1920; background: "paper" | "dark" };
  objects: GeometryObject[];
  actions: GeometryAction[];
};

export type GeometryIssue = {
  code: string;
  message: string;
  path?: (string | number)[];
};

export type GeometryValidationResult = {
  program: GeometryProgram;
  actions: GeometryAction[];
  errors: GeometryIssue[];
  warnings: GeometryIssue[];
};
