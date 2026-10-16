# Free Geometry Editor — 2D construction graph

Route: `/geometry-editor` (authenticated Academy family/teacher/admin).
Stacked PR: #13, built on interactive geometry lab PR #12, which itself depends
on verified construction primitives PR #10.

## What is supported

- Create **free points** by clicking arbitrary positions on the canvas.
- Create **infinite lines, finite segments**, or **circles with a center and
  point on circumference**. Pick two existing points or click blank space to
  create the needed free points inline.
- Create intersections between any two valid geometric shapes: line-line,
  line-circle, circle-circle, including line-segment and segment-segment
  clippings. A two-point intersection adds both dependent intersection points.
- Drag free points to recompute the entire dependent construction graph:
  intersections, subsequent lines, circles, and their further intersections.
- Select elements from the canvas or object list. Change point coordinates,
  rename or hide objects, and delete objects with **cascading dependent
  deletion** to preserve a valid graph.
- Undo/redo (50 snapshots), pan, zoom, show/hide grid, locally save progress in
  the browser, export versioned JSON, re-import previously exported JSON, and
  export static SVG. Works on pointer-enabled desktop and touch devices.
- The construction is isolated from the simulated mathematics exercise
  database. Dragging points does not rewrite saved exercise questions,
  authoritative answers, grading, or diagram metadata.

## Mathematical guarantees

`src/lib/free-geometry.ts` contains a small deterministic Euclidean
construction kernel. Objects form a **DAG in creation order**; references may
point only to existing earlier objects, so circular dependencies cannot
be imported or constructed.

A constructed shape is defined by two points, not arbitrary SVG coordinates:
- `line` / `segment`: two point references;
- `circle`: center point and through-point references;
- `intersection`: two shape references and deterministic solution branch 0/1.

For each drag, geometry is evaluated in topological order. A circle-circle
pair can have 0, 1 or 2 intersection points. A parallel or coincident line
pair has no **unique finite** intersection and generates none. Tangencies
generate one point. Segment intersections outside a segment are excluded.
Undefined dependent geometry is temporarily nonrenderable and may reappear
when parents move to make the intersection valid again. All shape inputs are
finite and bounded; a shape with coincident defining points is not created.

**Important**: Branch index 0/1 is deterministic for each intersection
algorithm. It is not a full continuity-tracking solver, so a user who reverses
the orientation of a defining line during a drag may observe two intersection
branches exchanging positions. Full symbolic tracking is future work.

## Security and persistence

- Zod rejects invalid version numbers, nonfinite coordinates, unexpected
  shape fields, duplicate IDs, unknown/forward references and cycles.
- Maximum 250 objects, coordinates bounded to [-1000,1000], labels up to
  12 characters, and imported JSON size bounded to 150k characters.
- Never insert user-provided SVG or HTML. SVG rendering always uses React
  primitives and validated numeric coordinates.
- Browser autosave uses the localStorage key
  `hg-geometry-editor-v1`. There is no cloud sync or server-side persistence;
  users should export JSON before clearing browser storage or switching devices.
- Undo history is local to the current page session and is not serialized.

## Interaction notes

Mouse/touch interaction uses SVG `getScreenCTM().inverse()`, ensuring correct
viewBox mapping on responsive canvases. Clicking the blank canvas with the
line/segment/circle tool creates a free point and connects it on the second
click. The **intersection tool** selects two line/segment/circle objects.

If removing a parent would invalidate a dependent object, the UI warns
that all such descendants will be removed.

## Scope and future work

This is a **GeoGebra-style foundational 2D geometry editor**, not complete
feature parity with the official GeoGebra system. Missing advanced features
include arbitrary conics, angle/polygon measurements, custom constraints,
perpendicular-bisector tools, loci, symbolic CAS, 3D plotting, simultaneous
equation solver, collaborative sync, and embedded lesson assignment sharing.

## Rollout

The GitHub Actions CI only tests/builds; it does **not** deploy the ECS site.
Review PRs in order: #10 -> #12 -> #13. Because `main` currently contains
additional UI commits, retargeting and resolving conflicts is necessary
before an on-site build/deploy and mobile/pointer device smoke tests.

No new Prisma migration is needed for this client-side editor.
