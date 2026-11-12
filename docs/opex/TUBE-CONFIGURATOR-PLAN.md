# Multi-layer tube page and configurator: plan (draft for review)

Status: **agreed 2026-11-12**. Build order is T1 → T6, one commit per phase, as with P0–P13 and D1–D6.

Progress: **T1 done**.
- Catalogue v3:
  - shapes per chart;
  - closures with chart wordings (`aliases`), fits and colours per shape and diameter;
  - colour families;
  - structures limited by shape, diameter or closure.
- The two charts are imported (round: 46 sizes, oval: 31). Ø60 round is kept from v2, pending the
  client.
- Import:
  - in the console at `/catalogue`;
  - via `POST /v1/manage/catalogue/tube/import` (preview, then apply as a draft);
  - via `pnpm --filter @arapoush/opex-api tube:chart` for the repository seed.
- A pre-v3 draft is upgraded on its first import.
- A new `map` field kind (keys from data: diameters, shape ids) lets an import add diameters or
  shapes without a schema change.
- Eye nozzle is now a closure that brings its own shoulder, not a tube shape. Old `shape=eyeNozzle`
  links still open.

## What the client asked for

- The whole `/products/multi-layer-tube` page managed in OPEX, component-based, editable live in the
  visual editor.
- The catalogue comes from the two size charts (round and oval cross-sections):
  - per shape: the diameters it offers;
  - per diameter: lengths with nominal volume, the closures that fit, and the colours each closure
    comes in.
- Closures will be added later.
- Printing options to be added later. Plan a slot for them now.
- Wall structure can differ per product option.
- Choosing a colour changes the tube or cap in 3D. Choosing a print style shows a live sample of that
  style on the chosen tube.
- New tube and cap shapes come from operator photos, without a developer and without asking Claude
  for a render.
- A more professional quote form:
  - the visitor chooses how to be contacted;
  - after sending, the visitor sees their ticket number and the department and person to quote it
    to.
- Related samples follow the selection.
- Everything is API-first in OPEX.

## Facts from the two charts (checked)

| | Diameters | Lengths per diameter | Closure types | Cap colours |
|---|---|---|---|---|
| Round | 19, 25, 30, 35, 40, 50 | 4–11 | 12 kinds | white · coloured · transparent · metallic silver/gold, per closure and diameter |
| Oval | 30, 35, 40, 50 | 6–9 | 5 kinds | same four families |

- The round chart has no 60 mm row, but today's catalogue offers Ø60. The client needs to say whether
  60 stays.
- One cell looks like a typo: oval Ø30, eye-nozzle cap, third colour row says "رنگی" where the
  other caps say "شفاف". We will import it as written and flag it.
- Today's catalogue has 4 closure families. The charts need these:
  - round: screw, long eye-nozzle, short eye-nozzle, lip-balm, screw flip-top, press flip-top, airless
    pump, octagonal cap, conical, bullet ("موشکی");
  - oval: oval screw, super-oval, oval eye-nozzle, oval screw flip-top, oval bullet.

## The two links: what they are

Both are **agent skills for Claude Code and similar tools**, not services with an API.

- **img2threejs**
  - What it does: an AI agent looks at **one** photo and hand-writes procedural Three.js code. It
    refines the result pass by pass.
  - Multi-view input is only on its roadmap. It does not produce GLB and has no unattended mode.
  - Licence: Apache-2.0.
- **3dviz.dev**
  - What it does: a skill for building creative 3D scenes from a text prompt (villages, anatomy,
    physics).
  - It does not reconstruct a product from photos.

So neither removes the need for someone (Claude) to run a session each time. They cannot be
triggered from OPEX. That is the opposite of what we want.

## Recommendation: parametric families plus an optional photo-to-3D job

Tubes and caps are turned and moulded parts. Their shape is a profile plus a few dimensions. That
is how `TubeScene.ts` already builds them (lathe profiles), and it is exact, tiny and instant.

1. **Parametric families, edited in OPEX (no AI, no developer).** Each closure is either:
   - an instance of a family, with its numbers (height, diameter ratio, nozzle length, facets, lid
     style), set in OPEX with a live 3D preview; or
   - an uploaded **GLB**.

   We extend the families to cover every closure in the charts: screw, flip-top (screw and press),
   eye nozzle (long and short), lip balm, airless pump, octagonal, conical, bullet, and the oval
   variants.

   A new cap that resembles an existing one is then data only. Most future caps will be this case.
2. **Photo-to-3D job for genuinely new shapes (optional, paid).**
   - The operator uploads photos: several angles, or one sheet with several views.
   - OPEX queues a job with a 3D-generation API that accepts multi-view images and returns GLB,
     with a server-side key (for example Tripo, Meshy or Hunyuan3D).
   - It scales the result to the chart dimensions and shows it to the operator for approval.
   - This is the same shape as the existing render job (`apps/opex-renderer`), so it fits the
     current queue, audit and approval flow.
   - It needs a provider account and a budget. This decision is yours.
3. **Cap and tube colour, live.**
   - Each closure lists its colours per diameter, from the chart: white, coloured (any Pantone or
     HEX the visitor picks, or a list the operator defines), transparent, metallic silver and gold.
   - The 3D material changes instantly: matte, frosted transmission, metallic.
   - The tube body colour is a separate option.
4. **Print preview, live.** Printing methods come from `page.printing` (flexo, dry offset, silk
   screen, hot stamp, combination).
   - Each method gets: where it applies (shapes and diameters), a sample artwork the operator uploads,
     and a material effect.
   - Example effects: hot stamp is metallic and glossy; silk screen is raised and opaque; offset is
     flat process colour.
   - The artwork wraps the printable zone of the chosen tube at its real size, so changing the size
     re-wraps it.
   - The visitor's own artwork upload can come later.

## Factory CAD (decided 2026-11-12): STEP/STP before any AI

Arapoush has STEP files for its tubes and closures, so they are the source for shapes that the
parametric families cannot express. No image-to-3D is involved, and no paid API.

- **Pipeline (OPEX worker, like the renderer):**
  1. upload `.step` / `.stp`;
  2. **occt-import-js** (OpenCascade, LGPL-2.1: used as an unmodified library; its notice ships with
     OPEX) reads it into meshes in millimetres;
  3. normalize the axis and units, and check the limits (file size, triangles, time);
  4. GLB;
  5. **glTF Transform** (MIT) welds, simplifies and compresses it (meshopt);
  6. the console shows a preview and an operator approves it.

  The site only downloads the approved GLB, and never processes STEP.
- **Mounting contract**, stored once per part:
  - `axis`: the closure opening along −Y;
  - `anchor`: the point that sits on the tube neck, in mm;
  - `neckDiameterMm` and `thread`;
  - the fits, which already come from the charts.

  With the contract, the scene places a GLB closure on the neck exactly as it places a parametric one.
  It is never scaled to fit. If the anchor or neck size is missing, the part stays "needs review"
  and is not shown on the site.
- **Viewer:** stays on the existing Three.js scene (`TubeScene.ts`, already lazy-loaded, the same
  `GLTFLoader` family). Moving to React Three Fiber would add weight to a page that already scores 100
  on desktop, without a capability we need.
- **First proof (start of T2):**
  1. one tube STEP and one flip-top STEP, imported without changing their proportions;
  2. the cap is mounted by its anchor on the parametric Ø30 tube;
  3. the result is compared with the parametric cap in the existing viewer.

  Then the console upload screen is built on the same pipeline.

## Content model (OPEX), replacing `product.tube.catalogue` v2

Each record type and its fields:
- **shape**: id, name (L), model family, cross-section, image, printable zone, diameters, and per
  diameter its sizes (length, volume, status).
- **closure**: id, name (L), image, and its 3D source: a family with params, or a GLB.
  - Per shape and diameter: fit status (chart or confirm) and colour families offered.
  - The neck it needs.
- **colour families**: white, coloured, transparent, metallic. Each has a material preset and an
  optional palette.
- **structure**: id, name (L), layers, and where it applies (shapes, diameters, and optionally
  closures).
- **print**: method id (from `page.printing`), where it applies, sample artwork, effect preset and
  minimum order (optional). Empty until the client provides the data, but the page already handles
  it.
- **sample**: image, title (L) and tags (shape, diameter, closure, print, colour). The page ranks
  samples by how many tags match.
- **page sections**: hero, configurator, layers, samples, quote and FAQ. Each has `style` variants,
  wrapped in `EditScope` for the visual editor.

**Excel import in OPEX.**
- The operator uploads the chart (`.xlsx`) and sees a preview and diff. Applying it creates a draft
  with the normal review and publish flow.
- It is exposed as an API route with a contract (D1 rules).
- The two charts you sent become the first import and a test fixture.

## Quote form

- An OPEX system form `tube-quote`. The configuration (shape, size, volume, closure and colour,
  structure, print) is attached as structured fields, not as free text.
- New fields:
  - preferred contact: phone call, WhatsApp, Telegram, email or a visit;
  - best time;
  - company, quantity, target date and artwork upload.
- **Success panel**:
  - "Your request is registered as ticket **#1234**."
  - The department and the person to quote it to (name, extension, mobile), read from `page.contact`
    according to the form's routing (sales by default).
  - A "copy number" button, and the same number in the confirmation email.

## Phases

| Phase | Scope |
|---|---|
| **T1** | Catalogue v3 schema and types; Excel importer (API, contract, console screen, test fixture from the two charts); migration from v2; snapshot. |
| **T2** | Closure families extended to every chart closure; family params editable in OPEX with a live preview; **factory CAD import**: STEP/STP → mesh (occt-import-js, in a worker) → GLB (optimized with glTF Transform), stored per closure with its mounting contract (see below), reviewed and approved in the console. |
| **T3** | Live colour (cap and body) and print preview (wrap, effect presets); `page.printing` link. |
| **T4** | Page sections as components with variants, plus `EditScope` and live edit; related samples ranking; SEO, JSON-LD (Product, offers by size), sitemap and llms. |
| **T5** | `tube-quote` system form, contact preference, success panel with ticket number and responsible person, confirmation email. |
| **T6 (optional)** | Photo-to-3D job with a provider API, operator approval, GLB into the closure library. |

Each phase ends with:
- `pnpm check`;
- stories for new components;
- `docs:check`;
- the API contract tests;
- Lighthouse A/B against the previous build on the same machine.

## Decisions needed

1. **Photo-to-3D (T6):** dropped from the main path. Factory STEP files plus parametric families
   cover it (2026-11-12). It is kept only as an optional, non-engineering preview.
2. **Ø60 round:** keep it (it is not in the chart)?
3. **Contact options** in the quote form: phone, WhatsApp, Telegram, email, visit. Remove any?
