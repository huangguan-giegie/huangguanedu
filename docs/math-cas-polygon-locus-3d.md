# Phase 7 — CAS, arbitrary polygons, loci, 3D graphing

This phase extends stacked PR #13 (free geometry editor), which depends on
PR #12 (interactive geometry lab). PR #10 has already been merged.

## Symbolic algebra (CAS)

`/math-studio` includes a deterministic, no-eval univariate polynomial CAS
in `src/lib/polynomial-cas.ts`. It handles:

- Integer and decimal literals (up to six decimal places), exact rational
  arithmetic, implicit multiplication such as `2x` and `(x+1)(x-2)`,
  parentheses, powers from 0 to 8, and Unicode ², ³, ×, ÷, −.
- Polynomial simplification and expansion, polynomial derivatives,
  polynomial indefinite integrals, and exact rational substitution.
- First- and second-degree equation solving. Rational roots are exact;
  irrational quadratic roots are labeled as numerical approximations.
- Rational factorization of first- and second-degree polynomials.

For safety and honest scope, no arbitrary expression execution, external
formula library, JS execution, user-defined function calls, transcendental
functions, full rational functions, higher-degree equation solving, symbolic
limits, inequalities or general CAS engine parity. Inputs and coefficient
magnitudes are bounded. Error messages disclose unsupported cases.

## Arbitrary polygons

The `/geometry-editor` adds the `polygon` tool. Select 3–30 distinct
existing/free points, then choose **Finish polygon**. Coordinates derive from
the same free-point/constructed-point DAG as other objects. A shoelace
calculation reports area and perimeter. Concave polygons work. The
simple-polygon validator rejects crossing edges, collapsed vertices and
degenerate area. Dragging parent points recomputes geometry. If a parent
movement makes a polygon invalid, its shape disappears until constraints are
restored; no invented area is shown.

The JSON document has version 1, now with `kind:"polygon"` and ordered
`vertices:string[]`. Schema validation rejects forward references,
missing/nonpoint vertices and duplicate names in the vertex ID array.

## Dynamic point loci

The `locus` tool uses three selections in order:

1. Pick a **free driver point**.
2. Pick a **fixed driver path**, either line, segment or circle.
3. Pick an **existing derived target point** that depends on the driver.

The `locus` object stores the three IDs and bounded sample count. At every
sample the driver moves along its path, the full mathematical dependency DAG
is re-evaluated, and the resulting target position is plotted. This is a
reproducible geometric locus—not just a record of mouse trail positions.
Undefined intersections split the curve into disconnected fragments.
The graph prevents circular dependency: the target must depend on the driver
but the driver path may not. Default resolution is 96 segments, maximum 160.

Loci update when ancestors move and are persisted in the browser-exported
JSON document, like other geometry objects.

## Three-dimensional plotting

`/math-studio` also includes a three-dimensional teaching plotter based on
deterministic parametric surfaces:

- Plane: `z=a(x+y)/2`
- Elliptic paraboloid: `z=a(x²+y²)/4-2`
- Hyperbolic paraboloid: `z=a(x²-y²)/4`
- Sphere: `x²+y²+z²=9`
- Torus: `(sqrt(x²+y²)-2)²+z²=0.8²`
- Helix: `(2cos t,2sin t,at/4-3)`

Control azimuth, elevation, scale and amplitude; drag the canvas to orbit.
Each point is calculated in 3D and projected to the SVG view. The sampled
surface grid is finite and bounded, with visible XYZ axes. Users can export
the current static view as SVG.

This is a mathematically calculated **wireframe** view, not WebGL or a
general arbitrary-`f(x,y)` parser. It does not support implicit surfaces,
3D mesh editing, depth-buffer occlusion, equation inequalities, arbitrary
volumetric solids or GeoGebra's 3D/CAS feature parity.

## Security and data boundaries

- No eval, Function, script interpretation or arbitrary SVG import.
- Strict Zod-schema documents, acyclic construction graph, 250-object limit,
  geometric bounds and bounded locus sampling.
- All interactions are in the student's browser and do not change stored
  AI-generated practice questions, answers, scores or DB tables.
- Free geometry editor autosaves locally. Export JSON for backup; the
  Math Studio tool is not persisted to the server.
- No Prisma migration is required for Phase 7.

## CI, release order and manual quality checks

Automated checks cover CAS algebraic identities and rejected input,
valid/invalid simple polygons, dependent locus sampling, parameterized 3D
surface equations, finite camera projections, and server rendering.

Release order: merge/rebase PR #12 onto latest `main`, merge/rebase #13,
then merge/rebase this phase. Reconcile any newer design or navigation
changes during these steps. Current GitHub CI does **not** publish the
production deployment to ECS.

Before deployment, manually verify desktop and touch interactions:
create/close concave polygons, reject crossing edges, select a driver/path/
dependent target for locus, drag upstream points, use all CAS examples,
orbit each 3D model, test dark/light themes and validate exported SVG/JSON.
