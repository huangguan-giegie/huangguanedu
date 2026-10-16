# Interactive Geometry Lab — Phase 5

Route: `/geometry-lab`. Accessible to authenticated family, teacher, and
administrator accounts via the normal Academy sidebar/mobile navigation.

This is a **separate, client-only mathematical exploration space**, not a new
mode for changing already assigned practice questions.

## What students can do

- Select **angle bisector**: move vertex A in the plane while B, C stay fixed.
  The angle bisector endpoint D is recomputed using
  `BD/DC = AB/AC`, with actual equal-angle verification.
- Select **similar triangles**: drag the small triangle's B and C to change
  the legs, or drag the large triangle's E to change the scale factor.
  The triangles preserve two right angles, orientation, and all three side
  ratios. Both triangles use the same pixel-to-centimeter scale.
- Select **two-circle tangent**: move small circle center O₂ or drag the
  radius handles. Both tangent points are recomputed by the constraint
  solver, preserving the circle positions and radius/tangent perpendicularity.
- Use accessible range sliders, a show/hide guide toggle and reset.
  Keyboard arrow keys nudge focused control points by 0.1 unit.
  On touch devices, the SVG prevents accidental scrolling only while
  interacting within its own canvas.

A status line indicates that the construction constraints are satisfied.
Numbers displayed in the lab are rounded to two decimal places, while
the underlying geometry verifier computes on full precision.

## Safety and source of truth

The AI never supplies free-form SVG, JavaScript, draggable vertices or
unvalidated diagram descriptions. This interactive lab keeps all adjustments
in component state. **There is no network request or database write.**
It cannot modify a saved question, exam answer or stored question diagram.

The local pure `src/lib/geometry-lab.ts` projects mouse/touch/keyboard
coordinates to bounded parameter ranges and calls the existing
`practice-construction-constraints.ts` verifiers before rendering.

### Pointer mapping

Browser pointer pixels are converted through the SVG screen CTM inverse,
not naive `clientX / rect.width`. This is necessary when the canvas is
responsive and maintains the viewBox aspect ratio with margins. Pointer
capture stays on the root SVG during dragging to avoid losing touch input
when the handle's center moves.

### Degenerate-case handling

- Bisector apex is kept above the BC base with positive triangle area.
- Similar triangle lengths remain positive with nonzero scale and no
  inverted orientation.
- External tangent circles preserve `R > r > 0` and
  `d > R+r`, excluding intersecting circles with imaginary tangent
  solutions.
- Non-finite values are normalized into safe defaults.
- All canvas control-point locations stay within the visible viewBox
  when the parameter bounds are respected.

## Testing and manual QA

Unit/property tests sample each model's entire parameter boundary and
intermediate values, check SVG-to-world transform reversibility and mutate
out-of-bounds drags. SSR tests verify that the initial studio renders
without DOM globals, and that accessible controls exist.

After CI succeeds, manually verify in the development app:

1. Mouse-drag A towards every corner; D remains on BC.
2. Touch-drag B, C and E on a phone; triangles never leave the viewBox.
3. Press arrow keys on focused handles and operate keyboard-only sliders.
4. Move O₂ directly toward O₁; circles remain separated and the tangent
   segment remains perpendicular to both radii.
5. Toggle helper lines and reset in each mode.
6. Navigate away to a practice set; its saved figure, question, answer,
   and grading state remain unchanged.
7. Check the Academy's light and dark themes, sidebar and mobile navigation.

## Merge order

This feature branch is stacked on `feat/verified-construction-geometry-20261016`
because it uses that branch's verified construction model.

1. Merge PR #10 (constrained advanced geometry) into `main` after checking
   its compatibility with subsequent Academy UI changes.
2. Retarget PR #12 to `main` (it should then include only the lab additions)
   and resolve any conflicts from the newer UI/navigation files.
3. Build, test and deploy on the existing ECS release process. The lab does
   not require a new Prisma migration.

The lab is intentionally **not** a GeoGebra replacement with arbitrary
user-created objects or a symbolic theorem prover. It provides three
well-defined, constrained interactive geometry demonstrations.
