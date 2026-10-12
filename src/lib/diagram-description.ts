/**
 * 几何图形结构化描述：AI 只输出拓扑关系，程序接管坐标计算和 SVG 渲染。
 * diagramDescription 不存入数据库，仅在 AI 输出 → 渲染链路中使用。
 */
import { z } from "zod";
import { latexToUnicode } from "./latex-to-unicode";

// ---------- 类型定义 ----------

/** 几何图形类型 */
export type DiagramShapeType =
  | "single-triangle"
  | "collinear-triangles"
  | "parallelogram"
  | "circle"
  | "intersecting-lines"
  | "function-graph";

/** 顶点描述：只提供 label（字母标识），坐标由程序计算 */
export const DiagramVertexSchema = z.object({
  label: z.string().regex(/^[A-Za-z][A-Za-z0-9′']{0,2}$/),
});
export type DiagramVertex = z.infer<typeof DiagramVertexSchema>;

/** 函数图中的单条函数曲线 */
export const FunctionCurveSchema = z.object({
  expr: z.string().min(1).max(150), // 如 "y=1/x"、"y=x²-2x+1"、"y=2x+1"
  domain: z.tuple([z.number().finite().min(-1000).max(1000), z.number().finite().min(-1000).max(1000)]).refine(([a, b]) => a < b, "定义域下界必须小于上界").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type FunctionCurve = z.infer<typeof FunctionCurveSchema>;

/** 函数图中的关键点（交点、极值点等） */
export const FunctionKeyPointSchema = z.object({
  x: z.number().finite().min(-1000).max(1000),
  y: z.number().finite().min(-1000).max(1000),
  label: DiagramVertexSchema.shape.label,
});
export type FunctionKeyPoint = z.infer<typeof FunctionKeyPointSchema>;

/** 共线点组：这些点在同一条直线上（程序保证 y 坐标相同） */
export const CollinearGroupSchema = z.object({
  points: z.array(DiagramVertexSchema.shape.label).min(2).max(20),
});
export type CollinearGroup = z.infer<typeof CollinearGroupSchema>;

/** 三角形/多边形定义 */
export const DiagramPolygonSchema = z.object({
  vertices: z.array(DiagramVertexSchema.shape.label).min(3).max(6),
});
export type DiagramPolygon = z.infer<typeof DiagramPolygonSchema>;

/** 圆定义 */
export const DiagramCircleSchema = z.object({
  center: DiagramVertexSchema.shape.label,
  radiusPoint: DiagramVertexSchema.shape.label,
});
export type DiagramCircle = z.infer<typeof DiagramCircleSchema>;

/** 条件标注（等号刻度线或直角标记） */
const EqualTickMarkSchema = z.object({
  type: z.literal("equal-tick"),
  between: z.tuple([DiagramVertexSchema.shape.label, DiagramVertexSchema.shape.label]),
  count: z.number().int().min(1).max(3).optional().default(1),
});
const RightAngleMarkSchema = z.object({
  type: z.literal("right-angle"),
  at: DiagramVertexSchema.shape.label,
});
export const DiagramMarkSchema = z.discriminatedUnion("type", [EqualTickMarkSchema, RightAngleMarkSchema]);
export type DiagramMark = z.infer<typeof DiagramMarkSchema>;

/** 完整的 diagramDescription */
export const DiagramDescriptionSchema = z.object({
  shapeType: z.enum([
    "single-triangle",
    "collinear-triangles",
    "parallelogram",
    "circle",
    "intersecting-lines",
    "function-graph",
  ]),
  vertices: z.array(DiagramVertexSchema).min(0).max(20),
  collinear: z.array(CollinearGroupSchema).max(10).optional(),
  polygons: z.array(DiagramPolygonSchema).max(20).optional(),
  circles: z.array(DiagramCircleSchema).max(5).optional(),
  marks: z.array(DiagramMarkSchema).max(30).optional(),
  symmetry: z.enum(["left-right"]).optional(),
  // function-graph 专用字段
  functions: z.array(FunctionCurveSchema).max(6).optional(),
  keyPoints: z.array(FunctionKeyPointSchema).max(20).optional(),
}).superRefine((diagram, ctx) => {
  const labels = new Set(diagram.vertices.map((v) => v.label));
  if (labels.size !== diagram.vertices.length) ctx.addIssue({ code: "custom", message: "顶点标识不能重复" });
  if (diagram.shapeType === "function-graph") {
    if (!diagram.functions?.length) ctx.addIssue({ code: "custom", message: "函数图缺少函数表达式" });
    return;
  }
  const references = [
    ...(diagram.collinear ?? []).flatMap((g) => g.points),
    ...(diagram.polygons ?? []).flatMap((g) => g.vertices),
    ...(diagram.circles ?? []).flatMap((g) => [g.center, g.radiusPoint]),
    ...(diagram.marks ?? []).flatMap((g) => g.type === "equal-tick" ? g.between : [g.at]),
  ];
  if (references.some((label) => !labels.has(label))) ctx.addIssue({ code: "custom", message: "图形引用了不存在的顶点" });
  if (diagram.shapeType === "single-triangle" && labels.size !== 3) ctx.addIssue({ code: "custom", message: "三角形必须有三个顶点" });
  if (diagram.shapeType === "parallelogram" && labels.size !== 4) ctx.addIssue({ code: "custom", message: "四边形必须有四个顶点" });
  if (["collinear-triangles", "intersecting-lines"].includes(diagram.shapeType) && !diagram.collinear?.length) ctx.addIssue({ code: "custom", message: "缺少共线点定义" });
  if (diagram.shapeType === "circle" && diagram.circles?.length !== 1) ctx.addIssue({ code: "custom", message: "当前圆图须提供一个圆定义" });
});

export type DiagramDescription = z.infer<typeof DiagramDescriptionSchema>;

// ---------- 校验函数 ----------

/** 校验 diagramDescription 是否合法，返回校验后的对象或 null */
export function validateDiagramDescription(data: unknown): DiagramDescription | null {
  const result = DiagramDescriptionSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** AI 的 LaTeX 表达式先归一化，再交给零依赖安全数学解析器。 */
export function normalizeDiagramDescription(data: unknown): DiagramDescription | null {
  const parsed = validateDiagramDescription(data);
  if (!parsed || parsed.shapeType !== "function-graph") return parsed;
  return { ...parsed, functions: parsed.functions?.map((fn) => ({ ...fn, expr: latexToUnicode(fn.expr) })) };
}
