import { GeometryProgramSchema } from "./schema";
import type { GeometryAction, GeometryObject, GeometryProgram, GeometryIssue, GeometryValidationResult, Point } from "./types";

const bounds = { width: 1080, height: 1920 };
const issue = (code: string, message: string, path?: (string | number)[]): GeometryIssue => ({ code, message, path });

function pointOf(value: string | Point, objects: Map<string, GeometryObject>, errors: GeometryIssue[], path: (string | number)[]): Point | undefined {
  if (typeof value !== "string") return value;
  const object = objects.get(value);
  if (!object || object.kind !== "point") {
    errors.push(issue("OBJECT_REFERENCE_MISSING", `引用的点对象不存在或不是点：${value}`, path));
    return undefined;
  }
  return object.point;
}

function checkPoint(point: Point | undefined, errors: GeometryIssue[], path: (string | number)[]) {
  if (point && (point.x < 0 || point.x > bounds.width || point.y < 0 || point.y > bounds.height)) {
    errors.push(issue("OBJECT_OUT_OF_BOUNDS", "坐标超出 1080×1920 画布范围", path));
  }
}

function referencedIds(action: GeometryAction): string[] {
  switch (action.type) {
    case "draw": case "move-point": case "fill": case "trace": return [action.objectId];
    case "rotate": case "reflect": case "highlight": return action.objectIds;
    case "construct-parallel": case "construct-perpendicular": return [action.sourceId, action.through, action.resultId];
    case "transform-formula": return [action.from];
    default: return [];
  }
}

export function validateGeometryProgram(input: GeometryProgram): GeometryValidationResult {
  const parsed = GeometryProgramSchema.safeParse(input);
  if (!parsed.success) {
    return { program: input, actions: input.actions ?? [], errors: parsed.error.issues.map((e) => issue("SCHEMA_INVALID", e.message, e.path.filter((part): part is string | number => typeof part !== "symbol"))), warnings: [] };
  }
  const program = parsed.data as GeometryProgram;
  const errors: GeometryIssue[] = [];
  const warnings: GeometryIssue[] = [];
  const objects = new Map(program.objects.map((object) => [object.id, object]));
  if (objects.size !== program.objects.length) errors.push(issue("OBJECT_ID_DUPLICATE", "对象 id 必须唯一"));

  for (const [index, object] of program.objects.entries()) {
    const path = ["objects", index] as (string | number)[];
    if (object.kind === "point") checkPoint(object.point, errors, [...path, "point"]);
    if (object.kind === "rectangle") {
      checkPoint(object.corner, errors, [...path, "corner"]);
      checkPoint({ x: object.corner.x + object.width, y: object.corner.y + object.height }, errors, [...path, "size"]);
    }
    if (object.kind === "square") {
      checkPoint(object.corner, errors, [...path, "corner"]);
      checkPoint({ x: object.corner.x + object.side, y: object.corner.y + object.side }, errors, [...path, "side"]);
    }
    if (object.kind === "circle") {
      const center = pointOf(object.center, objects, errors, [...path, "center"]);
      checkPoint(center, errors, [...path, "center"]);
      if (center) {
        checkPoint({ x: center.x - object.radius, y: center.y - object.radius }, errors, [...path, "radius"]);
        checkPoint({ x: center.x + object.radius, y: center.y + object.radius }, errors, [...path, "radius"]);
      }
    }
    if (object.kind === "label" || object.kind === "formula") checkPoint(pointOf(object.at, objects, errors, [...path, "at"]), errors, [...path, "at"]);
    if (object.kind === "line" || object.kind === "segment" || object.kind === "helper-line") {
      checkPoint(pointOf(object.start, objects, errors, [...path, "start"]), errors, [...path, "start"]);
      checkPoint(pointOf(object.end, objects, errors, [...path, "end"]), errors, [...path, "end"]);
    }
    if (object.kind === "triangle") object.points.forEach((point, pointIndex) => checkPoint(pointOf(point, objects, errors, [...path, "points", pointIndex]), errors, [...path, "points", pointIndex]));
  }

  const actions = program.actions.map((action, index) => ({ action, index })).sort((a, b) => (a.action.start ?? 0) - (b.action.start ?? 0));
  if (actions.some((entry, index) => entry.index !== index)) warnings.push(issue("TIMELINE_SORTED", "动作按 start 时间重新排序"));
  let cursor = 0;
  for (const { action, index } of actions) {
    if (action.duration <= 0) errors.push(issue("DURATION_INVALID", "动作 duration 必须为正数", ["actions", index, "duration"]));
    const start = action.start ?? cursor;
    if (start > cursor) warnings.push(issue("TIMELINE_GAP", `动作时间轴存在 ${start - cursor} 秒空档`, ["actions", index]));
    for (const id of referencedIds(action)) if (!objects.has(id)) errors.push(issue("OBJECT_REFERENCE_MISSING", `动作引用的对象不存在：${id}`, ["actions", index]));
    const coordinateErrorsBefore = errors.length;
    if (action.type === "move-point") checkPoint(action.to, errors, ["actions", index, "to"]);
    if (action.type === "rotate") checkPoint(action.center, errors, ["actions", index, "center"]);
    if (action.type === "reflect") {
      checkPoint(action.axis.start, errors, ["actions", index, "axis", "start"]);
      checkPoint(action.axis.end, errors, ["actions", index, "axis", "end"]);
    }
    if (action.type === "move-point" || action.type === "rotate" || action.type === "reflect") {
      if (errors.length > coordinateErrorsBefore) errors.push(issue("ACTION_COORDINATE_OUT_OF_BOUNDS", "动作中的坐标超出画布范围", ["actions", index]));
    }
    if (action.type === "unsupported") warnings.push(issue("ACTION_UNSUPPORTED", `动作暂不支持，将跳过：${action.name}`, ["actions", index]));
    cursor = Math.max(cursor, start + Math.max(action.duration, 0));
  }
  return { program, actions: actions.map((entry) => entry.action), errors, warnings };
}
