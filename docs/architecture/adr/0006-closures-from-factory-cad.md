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
3. **Mounting contract, confirmed by an operator.** Each model records:
   - `axis`: the direction the cap's opening faces (from the cap towards the tube);
   - `anchorMm`: the point inside the cap that sits on the top of the neck (the inner ceiling);
   - `neckDiameterMm` and, optionally, `thread`.

   The scene rotates `axis` onto −Y (the tube is below the neck top) and puts `anchorMm` on the neck
   top. Before 2026-11-13 the scene rotated `axis` onto +Y; no factory model had been approved yet,
   so nothing needed migrating.

   **Suggested from the geometry (T2.1, `apps/opex-api/src/catalogue/mounting.ts`).** Rays are cast
   on a grid along each axis. The opening is the deepest pit closed by walls all round, so a cone or
   dome top, which runs out to the silhouette, does not count. Its ceiling gives the anchor and its
   inner chamber the neck width. The result is marked `high` or `low` confidence. An operator still
   saves it as the mounting, alone or "all confident ones" together. Without a mounting there is no
   approval. The model is never scaled to fit; the tube neck takes the model's neck diameter.

   **Per diameter.** Factory parts are made per tube diameter. A model uploaded with a shape and
   diameter is approved into `models3d[shape][diameter]` and used only there. Without them it goes
   to `model3d` and is used wherever no per-diameter model exists.

   Approval writes into the catalogue draft, and publishing makes it live.
4. **Fallback.** The parametric shape stays on the closure. If the GLB fails to load, the visitor
   still sees a correct parametric cap.
5. **Viewer.** The existing Three.js scene (`TubeScene.ts`) loads the GLB with `GLTFLoader` and the
   meshopt decoder, on demand. No React Three Fiber, which would add weight without a capability
   we need.

## Consequences

- Most new caps are data only (a chart import, then numbers in OPEX). Exact parts need a STEP file,
  named after the closure and diameter so the console can match it, and a look at the preview.
- Native CAD formats (SolidWorks `.SLDPRT`) are not read: export STEP.
- An image-to-3D step can be added later as an optional, clearly approximate preview. It is not
  part of the product path.
- The OpenCascade licence (LGPL-2.1) applies to the OPEX server. The library is used unmodified,
  its licence ships with it, and `apps/opex-api/THIRD_PARTY_NOTICES.md` records it.
