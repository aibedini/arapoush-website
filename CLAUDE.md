# Arapoush website — standing rules

Monorepo (pnpm + Turborepo). The site is `apps/web`: Next.js 15 App Router, locales `fa` (default, RTL),
`en`, `tr`. Paths below are relative to `apps/web`. Home sections come from `content/home-layout.json`
via `lib/sections.tsx`; copy lives in `lib/i18n/dictionaries/`. The OPEX content platform plan is
`docs/opex/OPEX-PLAN.md`.

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
   - Sections that clip their overflow use `content-visibility: auto`; `Reveals` re-measures
     ScrollTrigger when the page height changes. Don't add it to sections whose art overflows.
5. Accessibility: every control has a visible-text-matching accessible name, ≥ 24px targets, AA contrast.

## Motion

GSAP for timelines/scroll, animate-ui (motion) for micro-interactions. Every hover effect needs a touch
equivalent (`:active` under `@media (hover: none)`), and everything respects `prefers-reduced-motion`.

## RTL

Logical properties only. In `fa`, photos mirror via `[dir=rtl] img`; logos and seals carry `data-no-mirror`.
Images that GSAP transforms must be mirrored on their wrapper instead (GSAP resets the `scale` property).
