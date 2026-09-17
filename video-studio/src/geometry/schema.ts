import { z } from "zod";

const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const refOrPoint = z.union([z.string().min(1), PointSchema]);
const timed = { duration: z.number().finite(), start: z.number().finite().nonnegative().optional() };

const objectSchemas = [
  z.object({ id: z.string().min(1), kind: z.literal("point"), point: PointSchema }),
  z.object({ id: z.string().min(1), kind: z.enum(["line", "segment"]), start: refOrPoint, end: refOrPoint }),
  z.object({ id: z.string().min(1), kind: z.literal("triangle"), points: z.tuple([refOrPoint, refOrPoint, refOrPoint]) }),
  z.object({ id: z.string().min(1), kind: z.literal("rectangle"), corner: PointSchema, width: z.number().finite().positive(), height: z.number().finite().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("square"), corner: PointSchema, side: z.number().finite().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("circle"), center: refOrPoint, radius: z.number().finite().positive() }),
  z.object({ id: z.string().min(1), kind: z.literal("label"), text: z.string(), at: refOrPoint }),
  z.object({ id: z.string().min(1), kind: z.literal("helper-line"), start: refOrPoint, end: refOrPoint }),
  z.object({ id: z.string().min(1), kind: z.literal("formula"), tex: z.string(), at: refOrPoint }),
] as const;

export const GeometryObjectSchema = z.discriminatedUnion("kind", objectSchemas);

const actionSchemas = [
  z.object({ type: z.literal("draw"), objectId: z.string().min(1), ...timed }),
  z.object({ type: z.literal("move-point"), objectId: z.string().min(1), to: PointSchema, ...timed }),
  z.object({ type: z.literal("rotate"), objectIds: z.array(z.string().min(1)), center: PointSchema, angle: z.number().finite(), ...timed }),
  z.object({ type: z.literal("reflect"), objectIds: z.array(z.string().min(1)), axis: z.object({ start: PointSchema, end: PointSchema }), ...timed }),
  z.object({ type: z.literal("construct-parallel"), sourceId: z.string().min(1), through: z.string().min(1), resultId: z.string().min(1), ...timed }),
  z.object({ type: z.literal("construct-perpendicular"), sourceId: z.string().min(1), through: z.string().min(1), resultId: z.string().min(1), ...timed }),
  z.object({ type: z.literal("highlight"), objectIds: z.array(z.string().min(1)), ...timed }),
  z.object({ type: z.literal("fill"), objectId: z.string().min(1), color: z.string().min(1), ...timed }),
  z.object({ type: z.literal("trace"), objectId: z.string().min(1), ...timed }),
  z.object({ type: z.literal("transform-formula"), from: z.string().min(1), to: z.string(), ...timed }),
  z.object({ type: z.literal("unsupported"), name: z.string().min(1), ...timed }),
] as const;

export const GeometryActionSchema = z.discriminatedUnion("type", actionSchemas);
export const GeometryProgramSchema = z.object({
  canvas: z.object({ width: z.literal(1080), height: z.literal(1920), background: z.enum(["paper", "dark"]) }),
  objects: z.array(GeometryObjectSchema),
  actions: z.array(GeometryActionSchema),
});
