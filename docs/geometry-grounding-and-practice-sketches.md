# Geometry grounding and practice sketch integration (2026-10-17)

## Root cause

Some older math exercises stored a model-produced image whose vertex
placement did not satisfy its described numerical angles. In the reported
case, AB was a diameter and angle ADC was 125 degrees, but the image
placed D along an arc for which the drawn angle ADC was acute. The
previous free-form diagram process checked basic structure, not the
numeric truth of all angle conditions.

## Deterministic cyclic diameter construction

The new diagram type `cyclic_diameter_quadrilateral` accepts only
`obtuseAngle` in 110, 120, 125, 130, 140 degrees. Source of truth is
`cyclicDiameterGeometry`; radius, point angles, ordering and labels are
computed in trusted TypeScript, then the program numerically verifies:

- A, B, C, D all lie on the same circle.
- AB is a diameter.
- angle ACB = 90 degrees.
- angle ADC = user-selected obtuse angle.
- angle BAC = angle ADC - 90 degrees.

The problem compiler uses exactly the same parameter. AI cannot provide
coordinates or independent SVG for this type.

For legacy questions of this *precise* recognizable form, the practice
detail replaces an untrustworthy picture with the certified SVG.
This is a **render-only repair**: old answer and attempt records are
not silently modified. Teachers should audit existing scores and
re-run or reissue other unsupported free-form image problems manually.

## New junior geometry curriculum

The lab and editor share `junior-geometry-theorems.ts`: 17 searchable
rules, formula explanations, validity conditions, and sample calculations,
covering Pythagoras, triangle angle sum, bisector, midline, similar triangles,
circle chord and tangent, inscribed quadrilateral, areas, polygon angles,
and coordinate formulas.

The lab now includes a fourth interactive cyclic circle demonstration
and can export its deterministic construction as a validated editor DAG
project. Prior editor work is replaced only after confirmation.

The editor can transfer the squared distance between the chosen two
point endpoints to the CAS as a polynomial numeric expression; CAS can
read the user-triggered draft and verify it. The polynomial CAS no longer
offers the integration action in the student UI or dispatch interface.

## Cross-tool practice sketches

Free editor: click **Send to Practice** to save a validated construction
to the browser's `hg-geometry-clipboard-v1` draft key. Navigate to a
practice question detail and select **Attach editor work and save**.
The client sends a CSRF-protected PATCH to
`/api/v1/practice-questions/:id/geometry`.

The API checks that the authenticated family, teacher or administrator
has access to the target student's practice set before updating an
individual question. It applies the existing strict and bounded
construction DAG schema, so arbitrary SVG/HTML, unknown references,
cycles and non-finite coordinates cannot be uploaded.

Persisted `PracticeQuestion.geometrySketch` is a supplementary JSONB
geometry document. It is returned in the practice-set API and rendered
with trusted React SVG primitives and calculated dependencies. It
does **not** change canonical question text, official diagram metadata,
answers, mastery scoring, or submitted attempts. The student may remove
it without affecting grading.

A saved sketch is a read-only snapshot of the editor document at the
time of attachment; editing the editor again does not automatically
change previously attached question sketches. To update, attach again.

## Deployment

Requires a database migration:

`prisma/migrations/20261017000000_add_practice_geometry_sketch/migration.sql`

Pre-deployment checklist:

1. Backup the current PostgreSQL database.
2. Verify the server code/DB credentials refer to the production DB.
3. Run `npm run db:deploy` against production DB **before** replacing
   application build; this adds a nullable JSONB column.
4. Deploy the newly built Next.js app through the normal Alibaba ECS
   process (this repo's GitHub Actions is a CI build, not ECS CD).
5. Smoke-test old 125-degree question, newly generated cyclic-angle
   problem, CAS without integral UI, cyclic slider, and lab-to-editor
   to-practice upload/reload/print/remove.
6. Check authorization from another student's account and access to
   the PATCH endpoint, plus forbidden/invalid/cyclic JSON payloads.

Nothing in this PR implies that the currently deployed site has been
updated. The old image and existing stored answer can still be seen
until the new app version is deployed. Inspect the production database
migration status before any rollout.

## Remaining limitations

Free-form AI diagrams of types not covered by the authoritative
structured library still require human verification. Imported geometry
editor sketches are supplemental student constructions, **not** a
proof that they satisfy an existing generated question. A future
authoritative 'teacher-authored question from geometry' flow needs an
explicit theorem/constraint-backed answer compiler, not the present
freehand attachment.
