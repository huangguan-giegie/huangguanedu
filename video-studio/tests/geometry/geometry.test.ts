import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GeometryProgramSchema } from "../../src/geometry/schema";
import { validateGeometryProgram } from "../../src/geometry/validate";
import { renderManimScene } from "../../src/geometry/manim";
import type { GeometryProgram } from "../../src/geometry/types";

const program: GeometryProgram = {
  canvas: { width: 1080, height: 1920, background: "paper" },
  objects: [
    { id: "a", kind: "point", point: { x: 160, y: 500 } },
    { id: "b", kind: "point", point: { x: 520, y: 500 } },
    { id: "c", kind: "point", point: { x: 340, y: 220 } },
    { id: "ab", kind: "segment", start: "a", end: "b" },
    { id: "triangle", kind: "triangle", points: ["a", "b", "c"] },
    { id: "rect", kind: "rectangle", corner: { x: 600, y: 220 }, width: 240, height: 180 },
    { id: "square", kind: "square", corner: { x: 600, y: 500 }, side: 160 },
    { id: "circle", kind: "circle", center: { x: 840, y: 840 }, radius: 100 },
    { id: "label", kind: "label", text: "证明", at: { x: 160, y: 700 } },
    { id: "helper", kind: "helper-line", start: { x: 160, y: 700 }, end: { x: 840, y: 700 } },
    { id: "formula", kind: "formula", tex: "a^2+b^2=c^2", at: { x: 540, y: 1000 } },
  ],
  actions: [
    { type: "draw", objectId: "ab", duration: 1 },
    { type: "fill", objectId: "triangle", color: "#4cc9f0", duration: 0.5 },
    { type: "rotate", objectIds: ["square"], center: { x: 680, y: 580 }, angle: 90, duration: 1 },
    { type: "reflect", objectIds: ["rect"], axis: { start: { x: 600, y: 420 }, end: { x: 840, y: 420 } }, duration: 1 },
    { type: "trace", objectId: "circle", duration: 1 },
    { type: "transform-formula", from: "formula", to: "a^2+b^2=c^2", duration: 1 },
  ],
};

describe("GeometryProgram schema", () => {
  it("accepts the supported geometry objects and actions", () => {
    expect(GeometryProgramSchema.parse(program)).toEqual(program);
  });
});

describe("validateGeometryProgram", () => {
  it("reports missing references and out-of-bounds coordinates", () => {
    const result = validateGeometryProgram({
      ...program,
      objects: [{ id: "p", kind: "point", point: { x: 1081, y: 10 } }],
      actions: [{ type: "draw", objectId: "missing", duration: 0 }],
    });

    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["OBJECT_OUT_OF_BOUNDS", "OBJECT_REFERENCE_MISSING", "DURATION_INVALID"]),
    );
  });

  it("sorts timed actions and reports a gap without rejecting the program", () => {
    const result = validateGeometryProgram({
      ...program,
      actions: [
        { type: "draw", objectId: "ab", start: 3, duration: 1 },
        { type: "draw", objectId: "circle", start: 0, duration: 1 },
      ],
    });

    expect(result.actions.map((action) => action.start)).toEqual([0, 3]);
    expect(result.warnings.map((issue) => issue.code)).toContain("TIMELINE_GAP");
    expect(result.warnings.map((issue) => issue.code)).toContain("TIMELINE_SORTED");
  });

  it("keeps unsupported actions as non-blocking warnings", () => {
    const result = validateGeometryProgram({
      ...program,
      actions: [{ type: "unsupported", name: "bezier-warp", duration: 1 }],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((issue) => issue.code)).toContain("ACTION_UNSUPPORTED");
  });

  it("checks shape extents and action geometry coordinates", () => {
    const result = validateGeometryProgram({
      ...program,
      objects: [{ id: "circle", kind: "circle", center: { x: 1040, y: 100 }, radius: 100 }],
      actions: [{ type: "rotate", objectIds: ["circle"], center: { x: -1, y: 100 }, angle: 90, duration: 1 }],
    });

    expect(result.errors.map((issue) => issue.code)).toContain("OBJECT_OUT_OF_BOUNDS");
    expect(result.errors.map((issue) => issue.code)).toContain("ACTION_COORDINATE_OUT_OF_BOUNDS");
  });
});

describe("renderManimScene", () => {
  it("generates Chinese-commented Manim source for the supported primitives", () => {
    const source = renderManimScene(program);

    expect(source).toContain("# 由 GeometryProgram 生成的中文数学动画");
    expect(source).toContain("Dot(");
    expect(source).toContain("Line(");
    expect(source).toContain("Polygon(");
    expect(source).toContain("Rectangle(");
    expect(source).toContain("Square(");
    expect(source).toContain("Circle(");
    expect(source).toContain("Text(");
    expect(source).toContain("DashedLine(");
    expect(source).toContain("MathTex(\"a^2+b^2=c^2\").scale(0.5)");
    expect(source).toContain("Rotate(");
    expect(source).toContain("reflect_group(");
    expect(source).toContain("MoveAlongPath(");
    expect(source).toContain("TransformMatchingTex(");
    expect(source).toContain("self.play(");
  });

  it("writes the generated source when outputPath is provided", () => {
    const directory = mkdtempSync(join(tmpdir(), "geometry-program-"));
    const outputPath = join(directory, "scene.py");
    renderManimScene(program, outputPath);
    expect(readFileSync(outputPath, "utf8")).toContain("class GeometryProgramScene(Scene):");
  });

  it("公式变形引用公式对象时不把内部对象 ID 渲染到画面", () => {
    const source = renderManimScene({
      canvas: { width: 1080, height: 1920, background: "dark" },
      objects: [
        { id: "formula-from", kind: "formula", tex: "AB=DE", at: { x: 540, y: 300 } },
        { id: "formula-to", kind: "formula", tex: "\\triangle ABC\\cong\\triangle DEF", at: { x: 540, y: 450 } },
      ],
      actions: [{ type: "transform-formula", from: "formula-from", to: "formula-to", duration: 1 }],
    });

    expect(source).toContain('TransformMatchingTex(obj_formula_from, MathTex("\\\\triangle ABC\\\\cong\\\\triangle DEF"))');
    expect(source).not.toContain('MathTex("formula-to")');
  });
});
