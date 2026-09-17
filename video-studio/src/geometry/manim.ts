import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GeometryAction, GeometryObject, GeometryProgram, Point } from "./types";
import { validateGeometryProgram } from "./validate";

// GeometryProgram 使用像素坐标；这里把它映射到 10.8 × 19.2 的竖屏 Manim 画布。
const p = (point: Point) => `np.array([${(point.x - 540) / 100}, ${(960 - point.y) / 100}, 0])`;
const ref = (value: string | Point, names: Map<string, string>, pointIds: Set<string>) =>
  typeof value === "string" ? (pointIds.has(value) ? `${names.get(value) ?? "ORIGIN"}.get_center()` : names.get(value) ?? "ORIGIN") : p(value);

function objectName(id: string): string {
  return `obj_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function objectSource(object: GeometryObject, names: Map<string, string>, pointIds: Set<string>): string[] {
  const name = names.get(object.id) ?? objectName(object.id);
  switch (object.kind) {
    case "point": return [`        ${name} = Dot(${p(object.point)}, radius=0.06, color=YELLOW)`];
    case "line":
    case "segment": return [`        ${name} = Line(${ref(object.start, names, pointIds)}, ${ref(object.end, names, pointIds)}, color=BLUE)`];
    case "triangle": return [`        ${name} = Polygon(${object.points.map((point) => ref(point, names, pointIds)).join(", ")}, color=BLUE)`];
    case "rectangle": return [`        ${name} = Rectangle(width=${object.width / 100}, height=${object.height / 100}).move_to(${p({ x: object.corner.x + object.width / 2, y: object.corner.y + object.height / 2 })})`];
    case "square": return [`        ${name} = Square(side_length=${object.side / 100}).move_to(${p({ x: object.corner.x + object.side / 2, y: object.corner.y + object.side / 2 })})`];
    case "circle": return [`        ${name} = Circle(radius=${object.radius / 100}).move_to(${ref(object.center, names, pointIds)})`];
    case "label": return [`        ${name} = Text(${JSON.stringify(object.text)}, font="Noto Sans CJK SC").move_to(${ref(object.at, names, pointIds)})`];
    case "helper-line": return [`        ${name} = DashedLine(${ref(object.start, names, pointIds)}, ${ref(object.end, names, pointIds)}, color=GREEN)`];
    case "formula": return [`        ${name} = MathTex(${JSON.stringify(object.tex)}).scale(0.5).move_to(${ref(object.at, names, pointIds)})`];
  }
}

function actionSource(action: GeometryAction, names: Map<string, string>, formulaTexById: Map<string, string>): string[] {
  const object = (id: string) => names.get(id) ?? "ORIGIN";
  const run = (expression: string, duration: number) => [`        self.play(${expression}, run_time=${duration})`];
  switch (action.type) {
    case "draw": return run(`Create(${object(action.objectId)})`, action.duration);
    case "move-point": return run(`${object(action.objectId)}.animate.move_to(${p(action.to)})`, action.duration);
    case "rotate": return run(`Rotate(VGroup(${action.objectIds.map(object).join(", ")}), angle=${action.angle} * DEGREES, about_point=${p(action.center)})`, action.duration);
    case "reflect": return run(`reflect_group(VGroup(${action.objectIds.map(object).join(", ")}), ${p(action.axis.start)}, ${p(action.axis.end)})`, action.duration);
    case "highlight": return run(`Indicate(VGroup(${action.objectIds.map(object).join(", ")}))`, action.duration);
    case "fill": return run(`${object(action.objectId)}.animate.set_fill(${JSON.stringify(action.color)}, opacity=0.6)`, action.duration);
    case "trace": return [
      `        trace_path = ${object(action.objectId)}`,
      "        trace_dot = Dot(trace_path.get_start(), radius=0.05, color=YELLOW)",
      "        self.add(trace_dot)",
      `        self.play(MoveAlongPath(trace_dot, trace_path), run_time=${action.duration})`,
      "        self.remove(trace_dot)",
    ];
    case "transform-formula": {
      const targetTex = formulaTexById.get(action.to) ?? action.to;
      return run(`TransformMatchingTex(${object(action.from)}, MathTex(${JSON.stringify(targetTex)}))`, action.duration);
    }
    case "construct-parallel":
    case "construct-perpendicular":
      // 结果对象由 GeometryProgram 提前声明；这样即使构造参数很复杂，也能安全展示结果。
      return run(`Create(${object(action.resultId)})`, action.duration);
    case "unsupported": return [`        # 复杂动作已安全降级：${action.name}`];
  }
}

export function renderManimScene(program: GeometryProgram, outputPath?: string): string {
  const validation = validateGeometryProgram(program);
  if (validation.errors.length) throw new Error(`GeometryProgram 校验失败：${validation.errors.map((error) => error.message).join("；")}`);

  // 先建立完整名称表，再生成对象，避免线段排在端点前时被错误替换为 ORIGIN。
  const names = new Map(program.objects.map((object) => [object.id, objectName(object.id)]));
  const formulaTexById = new Map(
    program.objects
      .filter((object) => object.kind === "formula")
      .map((object) => [object.id, object.tex]),
  );
  const pointIds = new Set(program.objects.filter((object) => object.kind === "point").map((object) => object.id));
  const background = program.canvas.background === "paper" ? "#F4F0E8" : "#090A0D";
  const lines = [
    "# 由 GeometryProgram 生成的中文数学动画",
    "from manim import *",
    "import numpy as np",
    "",
    "config.pixel_width = 1080",
    "config.pixel_height = 1920",
    "config.frame_rate = 24",
    "config.frame_width = 10.8",
    "config.frame_height = 19.2",
    `config.background_color = "${background}"`,
    "",
    "def reflect_group(group, start, end):",
    "    direction = end - start",
    "    angle = np.arctan2(direction[1], direction[0])",
    "    return group.animate.shift(-start).rotate(-angle).apply_matrix(np.array([[1, 0, 0], [0, -1, 0], [0, 0, 1]])).rotate(angle).shift(start)",
    "",
    "class GeometryProgramScene(Scene):",
    "    def construct(self):",
    "        # 坐标原点位于画布中心，保证 1080×1920 竖屏对象不越界",
  ];
  for (const object of program.objects) lines.push(...objectSource(object, names, pointIds));
  lines.push("        # 按时间轴播放动作");
  for (const action of validation.actions) lines.push(...actionSource(action, names, formulaTexById));
  if (!validation.actions.length) lines.push("        self.wait(0.1)");
  lines.push("");

  const source = lines.join("\n");
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, source, "utf8");
  }
  return source;
}
