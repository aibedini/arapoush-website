# 3D studio: product lines, parts and labels (draft for review)

Status: **draft 2026-11-28**. S1 is built; S2 onward wait for review and the client's STEP files.

The client sends factory **STEP** files (sometimes a Sketchfab link, which is view-only unless its owner
enables downloads). STEP gives exact engineering geometry but no materials, so the studio's job is:
exact shape from STEP, materials and artwork set in OPEX, and one approved result used everywhere on the
site. No photo-to-3D (ADR 0006): it guesses the parts a photo does not show.

## What exists (T2, T2.1)

- Closure STEP/GLB upload in Catalogue → 3D models, converted on the server (OpenCascade, glTF
  Transform, meshopt), mounting read off the geometry, approved into the catalogue draft.
- The site's tube viewer swaps the parametric cap for the approved model, rotated and anchored, never
  scaled.

## S1 (built 2026-11-28)

- **Label, live:** the visitor's JPG, PNG, WebP, SVG, PDF or AI artwork on the configurator's tube,
  front or all round, at real size. Read in the browser only (`lib/configurator/label.ts`,
  `components/configurator/LabelField.tsx`).
- **Console studio:** `components/studio/ModelStudio.tsx` shows each uploaded model mounted on a tube
  neck before approval, following the mounting fields live, with a half-section, the site's cap finishes,
  a body colour and a PNG snapshot.

## S2: product lines and a parts library

Today models belong to tube closures only. S2 makes them a library any product line can use.

- **Part:** id, kind (`body`, `closure`, `insert`), line (`tube`, `effervescent`, later jars and others),
  name (fa, en, tr), category, aliases for name matching, source STEP, converted GLB, status.
- **Body mounting contract:** a body has its neck too (axis, anchor at the neck top, neck Ø, thread).
  A closure fits a body when neck Ø and thread match. OPEX suggests the pairs; the operator confirms.
  The same contract places any closure on any body, as the tube viewer does now.
- **Line:** a list of bodies and closures with the pairs allowed, plus the page it feeds. A new line is
  data: no code, unless it needs its own configurator controls.
- **Console:** Catalogue → 3D models becomes a parts library with filters by line and kind, the
  bulk drop and name matching of T2.1, and the S1 studio showing a chosen body with a chosen closure.

## S3: how a product is shown on the site

- Each product, and each sample, gets `display`: `3d`, `photo` (industrial photograph) or `both`
  (photo first, a "view in 3D" switch).
- One lazy viewer component for any line (the tube viewer's loader and controls, without the tube
  configurator), so samples, product cards and pages can show the approved 3D.
- Industrial images can be rendered from the same approved parts by `apps/opex-renderer`, so photo and
  3D always match.

## S4: effervescent tube, true to the part

- The effervescent page's exploded and opening effects are drawn, not taken from the part. With the
  body and cap STEP, the scene shows the real cap (spiral or plain), its desiccant chamber and how it
  really opens, from the part's own geometry.
- Needs: the effervescent body and both caps as STEP.

## S5: artwork in OPEX

- Operators attach a client's label to a sample, as visitors do in S1; the renderer makes the
  sample's image from it, so samples can be added without a photo shoot.

## Decisions needed

1. STEP files for the effervescent body and caps, and for any other line to add next.
2. Which line comes after the effervescent tube.
3. Whether visitors' labels should also be attached to the quote automatically (today they attach the
   file in the form themselves).
