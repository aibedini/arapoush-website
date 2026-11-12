# ADR 0006: Closures in 3D come from factory CAD or parametric families, never from photos

Status: accepted · 2026-11-12

## Context

- The tube configurator must show every closure in the size charts (17 today), and new ones later.
- Developers or Claude should not have to model a cap each time one is added.
- Arapoush is an industrial manufacturer. A guessed shape must not be presented as its product.
- Image-to-3D tools reviewed:
  - img2threejs and 3dviz.dev are agent skills, not services;
  - TripoSR-style models produce approximate meshes;
  - paid photo APIs were considered too.

  None gives engineering dimensions. One photo cannot show threads, inner geometry or the back.
- Arapoush has STEP files for its parts.

## Decision

1. **Parametric family (`model: "param"`).** Any turned or faceted cap is described by `shape3d` in
   ratios of the tube radius: body, oval, width, height, top (flat, dome, cone or bullet), top
   height, grip ribs, pump. One definition fits every diameter it is offered on. Operators edit it
   in OPEX. A chart import creates new closures in this family.
2. **Factory CAD for exact parts.**
   - STEP/STP or GLB uploaded in the console is converted in a worker thread, so a heavy file never
     blocks the API:
     - `occt-import-js` (OpenCascade, LGPL-2.1, unmodified) tessellates STEP in millimetres;
     - glTF Transform welds, simplifies to 80k triangles at most and compresses it (meshopt).
   - It is stored as an OPEX media asset (`.glb`).
3. **Mounting contract, never guessed.** Each model records:
   - `axis`: from the mounting face towards the tube;
   - `anchorMm`: the point on the neck top;
   - `neckDiameterMm` and, optionally, `thread`.

   An operator sets it; the console can suggest the centre of a bounding-box face. Approval writes
   `model3d` into the catalogue draft, and publishing makes it live. Without a mounting there is no
   approval. The scene rotates and positions the model but never scales it to fit; the tube neck
   takes the model's neck diameter.
4. **Fallback.** The parametric shape stays on the closure. If the GLB fails to load, the visitor
   still sees a correct parametric cap.
5. **Viewer.** The existing Three.js scene (`TubeScene.ts`) loads the GLB with `GLTFLoader` and the
   meshopt decoder, on demand. No React Three Fiber, which would add weight without a capability
   we need.

## Consequences

- Most new caps are data only (a chart import, then numbers in OPEX). Exact parts need a STEP file
  and two minutes of review.
- An image-to-3D step can be added later as an optional, clearly approximate preview. It is not
  part of the product path.
- The OpenCascade licence (LGPL-2.1) applies to the OPEX server. The library is used unmodified,
  its licence ships with it, and `apps/opex-api/THIRD_PARTY_NOTICES.md` records it.
