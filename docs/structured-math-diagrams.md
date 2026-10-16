# Structured diagrams for generated math exercises

This document describes the **grounded geometry and function chart** contract in
`src/lib/practice-diagram.ts` and `src/lib/practice-advanced-diagram.ts`.

## Why

Generative-image models frequently produce attractive but mathematically
inconsistent pictures (a circle with the wrong angle, an unrelated triangle,
two graphs that do not intersect at the answer, etc.). This feature therefore
does **not** request arbitrary images, HTML or SVG from a language model.

A valid exercise uses only a narrow JSON **diagram specification**. The server
validates it with Zod, regenerates the question wording and solution from that
specification, persists it, and passes the exact same structure to React/SVG.

```
AI proposal -> JSON schema -> exact mathematical compiler -> DB
                                       |                         |
                              question/answer/explanation      SVG
```

The generated wording/answer is authoritative; any contradictory AI-written
question, diagram description, answer or explanation is discarded. Unsupported
diagram types or numeric ranges cause a retry rather than a false image.
Questions with references such as “如图” but no diagram are also rejected.

## Supported templates

| Type | Given data | Guaranteed relationship |
| --- | --- | --- |
| `rectangle` | width, height, area/perimeter | Lengths and formula |
| `right_triangle` | one of four Pythagorean triples | Right angle and side lengths |
| `linear_function` | slope, intercept | Two plotted points lie on the line |
| `circle_sector` | radius, selected minor central angle, task | Exact fractional multiple of π for arc length or sector area |
| `circle_inscribed_angle` | selected central angle | Inscribed angle equals half the subtended central angle |
| `circle_tangent` | selected Pythagorean triple | Tangent at A is perpendicular to radius OA |
| `circle_chord` | selected Pythagorean triple | Chord bisected by perpendicular from center |
| `triangle_altitude` | even base, height, foot location | Altitude is perpendicular and area is base × height / 2 |
| `triangle_midline` | even base | Constructed side midpoints and parallel half-length segment |
| `quadratic_vertex` | nonzero a, h, k | Vertex and axis from `y=a(x-h)^2+k` |
| `linear_intersection` | distinct slope pair, integer point P | Both lines pass through P |
| `quadratic_line_intersection` | two distinct chosen roots and linear equation | Both functions pass through exactly A and B |

All plotting is SVG produced by trusted TypeScript with numeric coordinates.
In coordinate graphs, horizontal and vertical units use the **same scale**.
For triangles, displayed base/altitude pixel ratios follow the given lengths
rather than a static decorative shape. Points in chord and circle-tangent
problems are derived from the Pythagorean parameters.

**Quiz answer leakage:** A diagram may show given information but must not
label an unknown result (e.g., a requested hypotenuse) with its answer,
including in accessible descriptions.

## Extending the contract

1. Add a bounded, well-conditioned shape to `advancedDiagramOptions`. Do not
   accept arbitrary JavaScript/SVG code, custom path strings or AI-authored
   coordinates from the browser or model.
2. Add a branch to `compileAdvancedDiagramProblem` calculating all given
   data, exact answers, and explanations from those validated fields.
3. Add an SVG renderer branch to `AdvancedPracticeDiagram.tsx` using the same
   geometry. Use `useId()` for any internal `clipPath` IDs.
4. Update the Qwen schema examples in `src/lib/practice-ai.ts`.
5. Add mathematical property tests and server-side SVG render checks.
6. Consider grading equivalence (fractions, π notation, degrees, units) and
   accessibility before enabling the template to students.

## Existing deployment requirements

### 线上功能整合

PR #9 的界面与精确图形功能已接入现有线上分支：保留异步生成任务、数学及英语变式练习、题组详情、在线判分、复制打印和深浅主题。新界面使用独立的 `academy-` 类名，避免覆盖既有页面。

异步生成链路识别 `diagram` 字段，复用同一编译器重算题干、答案与解析，将参数存入 JSONB，并在原有练习详情页渲染 SVG。历史图片及复杂图形的原有生成链路继续兼容；上文的精确数学保证仅适用于受支持的 `diagram` 模板。

生产同源校验以运行时 `APP_BASE_URL` 为准，防止反向代理的内部 HTTP 地址导致退出和提交被误拒绝；CSRF 令牌校验继续生效。

The UI and all diagrams are part of the open feature PR. The schema migration
`20261016000000_add_practice_diagram` stores a JSONB `diagram` field. Deploy
this migration before deploying the Next.js application:

```bash
npx prisma migrate deploy
npm run build
```

Follow the production ECS deployment procedure in
`docs/deployment-existing-ecs.md` (database backup, build, restart and smoke
test); CI does not automatically deploy to Alibaba Cloud.

## Current limitations

- This is an extensible **template engine**, not a general-purpose proof
  assistant or arbitrary-geometry CAD system.
- Unsupported free-form diagrams (multi-circle constructions, non-integer
  roots, arbitrary concave polygons) are currently rejected or generated as
  independent text-only questions, never illustrated speculatively.
- Past saved question text is unchanged; no attempt is made to reinterpret or
  repair historical generated images automatically.
- An AI model can still generate a flawed **text-only** mathematics question.
  This contract guarantees diagram-to-problem consistency for the supported
  structured diagram types, not complete mathematical correctness for every
  possible unstructured AI response.
