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
  | "rectangle"
  | "circle"
  | "intersecting-lines"
  | "function-graph";

const VERTEX_LABEL = z.string().regex(/^[A-Za-z][A-Za-z0-9′']{0,2}$/);

/**
 * 顶点描述：只提供 label（字母标识），坐标由程序计算。
 *
 * 真实几何题（尤其中考题）除主图形顶点外，普遍还有**辅助点**：垂足、交点、
 * 中点、折叠像点等。这类点不属于主多边形，但必须画出来，否则图形无法表达题意。
 * 用 `on` + `ratio` 声明「该点位于某条线段的哪个位置」，坐标仍由程序确定，
 * 不需要 AI 给出像素坐标。
 */
/** 轴对称像点：把某个点关于一条直线做镜像（如矩形折叠后点 C 的像点 C′） */
export const DiagramReflectSchema = z.object({
  /** 被镜像的原始点 */
  of: VERTEX_LABEL,
  /** 对称轴（折痕）经过的两个顶点 */
  axis: z.tuple([VERTEX_LABEL, VERTEX_LABEL]),
});
export type DiagramReflect = z.infer<typeof DiagramReflectSchema>;

export const DiagramVertexSchema = z.object({
  label: VERTEX_LABEL,
  /** 辅助点：位于由两个已定义顶点确定的线段上（如 "D 在 AB 上" → on:["A","B"]） */
  on: z.tuple([VERTEX_LABEL, VERTEX_LABEL]).optional(),
  /** 在 on 线段上的位置比例：0=起点，0.5=中点，1=终点。允许略微超出表示延长线。默认 0.5 */
  ratio: z.number().finite().min(-0.5).max(1.5).optional(),
  /**
   * 折叠/对称的像点：坐标 = 原顶点关于 axis 直线的镜像。
   * 比 on+ratio 更准——后者只能表达「在某条边上」，表达不了「关于 BD 对称」这个约束，
   * 实测会把折叠像点落到错误的角落、与别的顶点标注挤在一起。
   */
  reflect: DiagramReflectSchema.optional(),
  /**
   * 两条直线的交点：[第一条直线的两点, 第二条直线的两点]。
   * 折叠题里「BC′ 与 AD 相交于点 E」就是这个运算；用 on+ratio 只能靠猜，
   * 猜错的话交点不落在真正的交叉处，学生会照着图推出错误结论。
   */
  intersect: z.tuple([VERTEX_LABEL, VERTEX_LABEL, VERTEX_LABEL, VERTEX_LABEL]).optional(),
  /**
   * 垂足：{from, to:[直线两点]} 表示从 from 向该直线作垂线得到的垂足。
   * 「CD⊥AB 于点 D」这类表述必须用它——若只用 on+ratio 把 D 放在 AB 上，
   * 画出来的 CD 通常并不垂直于 AB，图形直接与题面矛盾。
   */
  foot: z.object({
    from: VERTEX_LABEL,
    to: z.tuple([VERTEX_LABEL, VERTEX_LABEL]),
  }).optional(),
});
export type DiagramVertex = z.infer<typeof DiagramVertexSchema>;

/** 显式辅助线：题目需要但主多边形/共线底边不包含的线段（如垂线、对角线、折痕） */
export const DiagramSegmentSchema = z.object({
  from: VERTEX_LABEL,
  to: VERTEX_LABEL,
  /** 辅助线画成虚线（如折痕、辅助线），默认实线 */
  dashed: z.boolean().optional(),
});
export type DiagramSegment = z.infer<typeof DiagramSegmentSchema>;

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
/**
 * 多边形：同时接受 {"vertices":["A","B","C"]} 与直接的 ["A","B","C"]。
 * 两种写法模型都会输出（后者更省 token），没有理由因为写法把整张图判非法。
 */
export const DiagramPolygonSchema = z.union([
  z.object({ vertices: z.array(DiagramVertexSchema.shape.label).min(3).max(6) }),
  z.array(DiagramVertexSchema.shape.label).min(3).max(6).transform((vertices) => ({ vertices })),
]);
export type DiagramPolygon = z.infer<typeof DiagramPolygonSchema>;

/**
 * 主图形的边长（可选，键为两个顶点标识直接拼接，如 "AB"）。
 * 用于让图形比例贴合题面给出的数值——矩形折叠题画成横着的矩形，
 * 会和题干「AB=8，BC=12」（竖长）明显矛盾，学生会照图理解错。
 */
export const DiagramSidesSchema = z.record(
  z.string().min(2).max(12),
  z.number().finite().positive().max(10000),
);
export type DiagramSides = z.infer<typeof DiagramSidesSchema>;

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

/** 每种图形由多少个顶点构成主图形 */
const PRIMARY_VERTEX_COUNT: Record<Exclude<DiagramShapeType, "function-graph">, number> = {
  "single-triangle": 3,
  "parallelogram": 4,
  // 矩形与平行四边形同样是四个主顶点，但矩形必须保持直角（布局引擎不再施加倾斜量）
  "rectangle": 4,
  // 其余图形的顶点数不固定，0 表示不做数量约束
  "collinear-triangles": 0,
  "intersecting-lines": 0,
  circle: 0,
};

/**
 * 取出主多边形（构成图形本身的那一组顶点，不含辅助点）。
 * 优先用显式 polygons，其次按 shapeType 的顶点数从 vertices 里取前 N 个。
 */
export function primaryPolygon(diagram: Pick<DiagramDescription, "shapeType" | "vertices" | "polygons">): string[] {
  const expected = PRIMARY_VERTEX_COUNT[diagram.shapeType as Exclude<DiagramShapeType, "function-graph">] ?? 0;
  const declared = diagram.polygons ?? [];
  if (expected) {
    const exact = declared.find((poly) => poly.vertices.length === expected);
    if (exact) return exact.vertices;
  }
  if (declared.length) {
    // 没有匹配尺寸时取顶点最多的一组，保证图形仍能画出来
    return [...declared].sort((a, b) => b.vertices.length - a.vertices.length)[0].vertices;
  }
  const labels = diagram.vertices.map((v) => v.label);
  if (!expected) return labels;
  // 未声明主多边形时，只能在「没有 on 的顶点」里取主图形顶点。
  // 否则 △ABC 附一个垂足 D 会被当成 A、B、D 三个顶点，图形整个画错。
  const anchors = diagram.vertices.filter((v) => !v.on).map((v) => v.label);
  return (anchors.length ? anchors : labels).slice(0, expected);
}

/** 取声明的边长（两个端点顺序任意），未声明则返回 undefined */
export function sideLength(
  diagram: Pick<DiagramDescription, "sides">,
  a: string,
  b: string,
): number | undefined {
  const sides = diagram.sides;
  if (!sides) return undefined;
  const value = sides[`${a}${b}`] ?? sides[`${b}${a}`];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** 完整的 diagramDescription */
export const DiagramDescriptionSchema = z.object({
  shapeType: z.enum([
    "single-triangle",
    "collinear-triangles",
    "parallelogram",
    "rectangle",
    "circle",
    "intersecting-lines",
    "function-graph",
  ]),
  vertices: z.array(DiagramVertexSchema).min(0).max(24),
  collinear: z.array(CollinearGroupSchema).max(10).optional(),
  polygons: z.array(DiagramPolygonSchema).max(20).optional(),
  circles: z.array(DiagramCircleSchema).max(5).optional(),
  sides: DiagramSidesSchema.optional(),
  marks: z.array(DiagramMarkSchema).max(30).optional(),
  /** 主图形之外的辅助线（垂线、对角线、折痕等） */
  segments: z.array(DiagramSegmentSchema).max(30).optional(),
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

  // 辅助点必须挂在一段由两个已知顶点确定的线段上；对称像点同理要引用已存在的顶点
  for (const vertex of diagram.vertices) {
    if (vertex.on) {
      for (const end of vertex.on) {
        if (!labels.has(end)) ctx.addIssue({ code: "custom", message: `辅助点 ${vertex.label} 引用了不存在的端点 ${end}` });
      }
      if (vertex.on[0] === vertex.label || vertex.on[1] === vertex.label) {
        ctx.addIssue({ code: "custom", message: `辅助点 ${vertex.label} 不能以自身作为线段端点` });
      }
    }
    if (vertex.reflect) {
      const { of, axis } = vertex.reflect;
      if (!labels.has(of)) ctx.addIssue({ code: "custom", message: `像点 ${vertex.label} 引用了不存在的原点 ${of}` });
      for (const end of axis) {
        if (!labels.has(end)) ctx.addIssue({ code: "custom", message: `像点 ${vertex.label} 的对称轴引用了不存在的顶点 ${end}` });
      }
      if (of === vertex.label || axis.includes(vertex.label)) {
        ctx.addIssue({ code: "custom", message: `像点 ${vertex.label} 不能以自身作为原点或对称轴端点` });
      }
      if (axis[0] === axis[1]) ctx.addIssue({ code: "custom", message: `像点 ${vertex.label} 的对称轴需要两个不同顶点` });
    }
    if (vertex.intersect) {
      for (const end of vertex.intersect) {
        if (!labels.has(end)) ctx.addIssue({ code: "custom", message: `交点 ${vertex.label} 引用了不存在的顶点 ${end}` });
      }
      if (vertex.intersect.includes(vertex.label)) {
        ctx.addIssue({ code: "custom", message: `交点 ${vertex.label} 不能以自身作为直线端点` });
      }
    }
    if (vertex.foot) {
      const ends = [vertex.foot.from, ...vertex.foot.to];
      for (const end of ends) {
        if (!labels.has(end)) ctx.addIssue({ code: "custom", message: `垂足 ${vertex.label} 引用了不存在的顶点 ${end}` });
      }
      if (ends.includes(vertex.label)) {
        ctx.addIssue({ code: "custom", message: `垂足 ${vertex.label} 不能以自身作为起点或直线端点` });
      }
      if (vertex.foot.to[0] === vertex.foot.to[1]) {
        ctx.addIssue({ code: "custom", message: `垂足 ${vertex.label} 所在直线需要两个不同顶点` });
      }
    }
  }

  const references = [
    ...(diagram.collinear ?? []).flatMap((g) => g.points),
    ...(diagram.polygons ?? []).flatMap((g) => g.vertices),
    ...(diagram.circles ?? []).flatMap((g) => [g.center, g.radiusPoint]),
    ...(diagram.marks ?? []).flatMap((g) => g.type === "equal-tick" ? g.between : [g.at]),
    ...(diagram.segments ?? []).flatMap((s) => [s.from, s.to]),
  ];
  if (references.some((label) => !labels.has(label))) ctx.addIssue({ code: "custom", message: "图形引用了不存在的顶点" });

  // 主图形用 primaryPolygon 判定，辅助点（带 on）不再计入数量，从而支持垂足/交点/折叠像点
  const primary = primaryPolygon(diagram);
  const expected = PRIMARY_VERTEX_COUNT[diagram.shapeType as Exclude<DiagramShapeType, "function-graph">] ?? 0;
  if (expected && primary.length !== expected) {
    ctx.addIssue({
      code: "custom",
      message: diagram.shapeType === "single-triangle"
        ? `三角形必须有三个主顶点（当前 ${primary.length} 个）`
        : `四边形必须有四个主顶点（当前 ${primary.length} 个）`,
    });
  }
  // 不属于主图形的顶点必须声明位置来源（on 线段插值 或 轴对称镜像），否则没有坐标可算、会画不出来。
  // 主顶点 = 主多边形顶点 ∪ 所有声明多边形的顶点（全等/相似的双三角形各有 3 个主顶点）
  //          ∪ 圆心（圆内接多边形时 O 是主顶点，此前被误判成辅助点导致整图被拒）。
  const primarySet = new Set(primary);
  for (const poly of diagram.polygons ?? []) {
    for (const label of poly.vertices) primarySet.add(label);
  }
  for (const circle of diagram.circles ?? []) {
    primarySet.add(circle.center);
  }
  for (const vertex of diagram.vertices) {
    if (!primarySet.has(vertex.label) && !vertex.on && !vertex.reflect && !vertex.intersect && !vertex.foot) {
      ctx.addIssue({ code: "custom", message: `辅助点 ${vertex.label} 必须用 on / reflect / intersect / foot 之一指定几何关系` });
    }
  }

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
