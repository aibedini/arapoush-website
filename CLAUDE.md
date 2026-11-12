# Arapoush website — standing rules

Monorepo (pnpm + Turborepo). The site is `apps/web`: Next.js 15 App Router, locales `fa` (default, RTL),
`en`, `tr`. Paths below are relative to `apps/web`. Home sections come from `content/home-layout.json`
via `lib/sections.tsx`; copy lives in `lib/i18n/dictionaries/`. The OPEX content platform plan is
`docs/opex/OPEX-PLAN.md`.

## Content comes from OPEX (lib/content)

- Pages, `generateMetadata`, the sitemap and llms routes call `await ensureContent()` before the sync
  loaders (`getDictionary`, `getTubeProduct`, `getEffervescentProduct`, `getPrinting`).
- No hard-coded image paths in components: images come from `t.media` (per-locale variants already
  picked), and contact details from `t.site`. A new image or text gets a field in the content: add it to
  `packages/schema/scripts/generate.ts`, then run `pnpm --filter @arapoush/schema generate`.
- After changing dictionaries or `content/*.json`, regenerate the snapshot (same command).
- Locked content (3D geometry, sizes, cap marker positions, renders) stays locked in
  `packages/schema/src/overrides.ts`. Effervescent renders are made by `apps/opex-renderer` from the
  site's own scene (`?webgl&render`); keep the `window.__effScene` API in `EffStage.tsx` in step with
  `apps/opex-renderer/src/main.ts`.

## Visual editor (P12)

- `/visual` in the console edits the real page in a frame. The site marks content with
  `components/opex/EditScope` and loads `components/opex/EditBridge` only in edit mode (draft mode plus
  the `opex_edit` cookie). Normal visitors get neither.
- A new section or page wraps its content in `EditScope` with the entry it reads, so the editor can
  match its text and images.
- Page-builder blocks live in a page's section list: `page.home.layout` → `sections`, or
  `product.tube.page` → `layout.sections`, each block as `sections[i].props`. Pages with sections
  are registered in `PAGE_LAYOUTS` (`packages/schema/src/blocks.ts`), with their built-in sections,
  entries and style variants. Block kinds and fields are in the same file, and blocks render in
  `components/sections/blocks/Block.tsx`.
- A new block kind needs all three: the schema in blocks.ts, the render in Block.tsx and the console
  label in the visual editor. Then regenerate the schema.

## API contracts (D1)

- Every HTTP route has a contract in its module's `contract.ts` (`apps/opex-api/src/**`). Website
  routes have theirs in `apps/opex-api/src/openapi/site.ts`.
- Handlers parse their input with the contract's schemas.
- A new or changed route updates its contract (responses, error codes, examples). Then run
  `pnpm docs:api` and commit `docs/api/*.openapi.json` with the code. Tests fail when a route has no
  contract or the committed spec is stale.
- See `docs/api/README.md` and `docs/DOCS-PLAN.md`.

## Documentation is part of every change (D4)

- Use the `documentation-maintenance` skill (`.claude/skills/documentation-maintenance`) for any
  change to routes, contracts, migrations, config, the schema, auth, integrations or shared
  components.
- Commits on documented surfaces change docs, or carry `Docs-Impact: none <reason>`. The commit-msg
  hook and CI enforce it.
- Before calling such work done:
  - run `pnpm docs:check` and `pnpm docs:breaking`;
  - run the API tests (contract tests);
  - report the real results.
- Shared components in `apps/*/components` have stories (`docs/storybook.md`). A new or changed
  component updates its story, and `pnpm docs:stories` passes (axe violations fail it).
- Conventional Commits; `pnpm changelog` regenerates `docs/changelog.md`. Contributing and branch
  protection are in `CONTRIBUTING.md`.

## SEO, AI indexing and speed are checked on EVERY change (client requirement)

Before calling any change done:

1. `pnpm check` passes (typecheck, lint, tests, `next build`).
2. Run Lighthouse against the production build (`pnpm start -p 3211` from the repo root, then
   `.lighthouse/run.sh /fa <name>` and `.lighthouse/run.sh /fa <name> desktop`).
   Targets: Accessibility, Best Practices, SEO = 100; Performance as high as the motion allows.
   Never let a score drop; report the numbers you measured.
3. Keep these in place and up to date:
   - `generateMetadata` in `app/[locale]/layout.tsx`: title, description, canonical, absolute hreflang
     (+ `x-default`), Open Graph, Twitter, robots.
   - JSON-LD graph (`lib/seo.ts` → `homeJsonLd`): new products, contact details or socials go there too.
   - `app/sitemap.ts` (add every new route, per locale), `app/robots.ts` (AI crawlers allowed),
     `app/llms.txt` and `app/llms-full.txt` (add new pages and sections).
   - `NEXT_PUBLIC_SITE_URL` must be the real production origin.
4. Performance habits:
   - Heavy interactive pieces (Radix dialogs/menus, touch effects) load on intent or idle, not at startup.
   - Animate only `transform`/`opacity` (and `clip-path`); never letter-spacing, width or top on large elements.
   - Only the first hero slide's images load with the page; images go through `next/image` with real `sizes`.
   - Below-the-fold sections should be server components where they don't need state.
   - Link/button label rolls use `components/ui/RollText` (CSS), not a JS text component per link.
   - Per-element effects are wired page-wide once (`Reveals`, `Drift`) in idle slices, not per component.
   - CSS is inlined with strict chunking (`next.config.ts`), so each page carries only its own styles.
     Loose chunking put other pages' CSS into every page (about 100 KB of HTML).
   - Form code is code-split (`components/forms/LazyOpexForm`). Use it wherever a form may appear.
   - Sections that clip their overflow use `content-visibility: auto`; `Reveals` re-measures
     ScrollTrigger when the page height changes. Don't add it to sections whose art overflows.
5. Accessibility: every control has a visible-text-matching accessible name, ≥ 24px targets, AA contrast.

## Motion

GSAP for timelines/scroll, animate-ui (motion) for micro-interactions. Every hover effect needs a touch
equivalent (`:active` under `@media (hover: none)`), and everything respects `prefers-reduced-motion`.

## RTL

Logical properties only. In `fa`, photos mirror via `[dir=rtl] img`; logos and seals carry `data-no-mirror`.
Images that GSAP transforms must be mirrored on their wrapper instead (GSAP resets the `scale` property).
