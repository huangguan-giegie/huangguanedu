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
| `triangle_angle_bisector` | a validated triangle side triple | D is on BC and ∠BAD = ∠DAC; BD/DC = AB/AC |
| `similar_right_triangles` | two right-triangle leg lengths, factor and asked-for leg | Corresponding angles and all three side ratios agree |
| `two_circles_external_tangent` | large/small radii and center distance | Circles do not overlap; both radii perpendicular to the same tangent; AB² = d² − (R−r)² |

All plotting is SVG produced by trusted TypeScript with numeric coordinates.
In coordinate graphs, horizontal and vertical units use the **same scale**.
For triangles, displayed base/altitude pixel ratios follow the given lengths
rather than a static decorative shape. Points in chord and circle-tangent
problems are derived from the Pythagorean parameters.

## Constraint verification for multi-figure construction (Phase 4)

The shared pure-TypeScript engine `src/lib/practice-construction-constraints.ts`
constructs vertices and tangent points from canonical side lengths or radii.
The same validated coordinates drive both algebraic question compilation and
SVG point positions, with bounded floating-point tolerance.

- **Angle bisectors:** enforce triangle inequality, exact three side lengths,
  D collinear and strictly between B and C, the proportional side segments,
  and equality of two angles computed using vector dot products.
- **Similarity:** check both right angles, all three corresponding length
  ratios, and consistent vertex orientation. Render small/large triangles
  using **the same pixels-per-unit**, not decorative differently scaled art.
- **Circle common external tangents:** check circle distance, non-overlap,
  both touch points on their own circle, perpendicular radius/tangent,
  parallel same-side radial normals, and the common-tangent length identity.

Each constructor calls its independent verification routine and throws if
any invariant fails. Tests independently perturb point locations and verify
that the altered constructions are rejected, as well as testing all permitted
schema variants and SVG appearance. Unknown answers display `?` instead
of their computed numeric value.

The validation engine is numerical, not a formal theorem prover or a
general draggable construction editor. Unsupported geometry should still
fail closed without producing a speculative illustration.

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
