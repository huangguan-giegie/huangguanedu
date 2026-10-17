# Geometry consistency and tool-to-exercise reuse — 2026-10-17

## Production regression (diameter / cyclic quadrilateral)

The screenshot titled "圆内接四边形与直径性质变式练习" states:

- Quadrilateral ABCD is inscribed in circle O;
- AB is a diameter;
- ∠ADC = 125°;
- Find ∠BAC.

The previous generic circle layout placed upper semicircle vertices
A–C–D–B. This forces ∠ADC to be acute, contradicting the actual givens.

### Verified construction

Keep AB as a horizontal diameter with center O. Place D between A and C
on the upper arc, i.e. **A–D–C–B**. Choose central positions:
A = 180°, B = 0°, C = 70°, D = 125° (using mathematical counter-clockwise
angles from positive x-axis). The circumcircle points yield

- ∠ADC = 125° (verified from dot products);
- ∠ACB = 90° (diameter theorem);
- ∠BAC = 35° (inscribed angle theorem).

**Do not fix this by changing only the text annotation.** The source of
truth must be one validated geometric construction for the diagram, answer
and explanation.

The new structured `circle_diameter_quadrilateral` template accepts a
bounded set of angle ADC values, computes its vertex positions, and checks
the actual three angles before rendering. It is available to generated
structured practice questions.

### Fail closed for generic AI diagrams

The existing asynchronous `practice-set.ts` pipeline had two critical
blind spots:

1. `diagramPremiseViolations` checked only off-segment feet and line
   intersections; explicit numeric angle claims were never compared to
   rendered coordinates. The new `diagramAngleClaimViolations` parses
   numeric ∠ABC = θ° givens, calculates their actual angle from the
   renderer's coordinates, and rejects deviations greater than 1.5°.
2. After a failed geometry retry the pipeline logged the remaining
   contradiction but **still saved the invalid figure**. It now abandons
   the contradictory images and generates a figure-independent written
   variant. If the fallback still refers to a missing figure it fails
   instead of persisting a broken exercise.

Explicit diameter claims also check that the named endpoints are opposite
each other about the actual center. Free-form AI SVG is no longer an
unverified fallback for geometry conditions: a sanitized SVG is secure
from active content but can still depict mathematically false geometry.

### Saved questions already on the site

Existing records are **not silently rewritten**. For the strict,
recognizable screenshot-specific diameter/∠ADC/∠BAC scenario, the practice
detail page hides the old unverified bitmap and shows an independently
computed diagram with a clear warning. It also prevents submitting the
legacy answer until a teacher reviews it.

A teacher/admin can click "核对后修复此题图片及标准答案". This calls an
authorization-protected repair endpoint scoped to their accessible student
and that exact question. It verifies the question matches the safe
known pattern, then writes the canonical question, answer, explanation,
and structured diagram to that row. The obsolete image reference is
cleared. Unrecognized legacy geometries are **not** auto-repaired.

The legacy repair is explicit, auditable by the resulting DB state, and
does not require a new Prisma migration.

## Geometry Lab (middle-school curriculum)

The original three draggable models remain. There are now five additional
parameter-driven demonstrations:

- Diameter / cyclic quadrilateral: change ∠ADC and watch ∠BAC recompute;
- Pythagorean right triangle: change two perpendicular legs;
- Regular n-gon: change the number of vertices, get interior sum/angle;
- Parallel lines and transversal: change angle values;
- Sector: change radius and central angle, recalculate arc length and area.

A twenty-item middle-school geometry theorem bank covers circle, triangle,
parallel line, polygon and coordinate relations.

The existing lab's three draggable constructions can be captured **at their
current parameters** and exported to a versioned editor document. The
explorer includes a starter 125° circle template. A free drawing remains a
snapshot and may no longer satisfy original invariants if manually edited.

## Free Geometry Editor and Practice handoff

The editor now has nine junior-geometry starter constructions (e.g. right
triangle, bisector, similar triangles, diameter circle, midline,
isosceles triangle, parallel lines, polygon, tangent circles). Users can
load a preset, edit it, then click "将当前作图准备给模拟题使用" to stage a
validated JSON construction in localStorage.

The Math Studio CAS can import this staged construction, visualize it and
extract measured segment lengths, circle radii, polygon area and perimeter.
Its **indefinite integration action is removed**, including the CAS
dispatcher and tests; algebraic simplification, factoring, basic equations,
derivatives and numeric substitution are retained.

The practice detail page lets anyone preview the staged figure for a
question on the same browser. Only a teacher/admin with access to the
associated student may persist a figure. Teacher confirmation is mandatory
because arbitrary constructions cannot be mathematically validated
against arbitrary natural-language question text automatically.

Attachment is stored in the existing `PracticeQuestion.diagram` JSON
field as an envelope, which preserves the original authoritative diagram.
The new `attachedDrawing` display field renders the construction using
safe React/SVG elements. The authoritative question, answer and grading
method are **not** overwritten by an attached custom drawing.

There is no server sync for unsubmitted drafts; students should export the
editor JSON for backup. Live draggable constraints are not serialized into
the final static practice attachment.

## Verification and release

Unit tests check the 125° screenshot, strict legacy question matching,
angle-coordinate conflict detection, diameter assertions, live lab capture,
existing diagram preservation, safe React rendering, and SVG-only fallback
rejection.

GitHub Actions checks lint, Vitest and Next.js build on the branch.
These workflows **do not deploy** to academy.huangguanedu.cn.

Deploy sequence: review & merge this PR into main, run CI, then deploy
the built main revision to the Alibaba ECS service. Verify in a real
authenticated browser that the old question offers safe repair for a
teacher and that a student's view no longer shows the erroneous diagram.
