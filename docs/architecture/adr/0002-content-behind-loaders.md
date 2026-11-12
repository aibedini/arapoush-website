# ADR 0002: The site reads OPEX behind its existing loaders

Status: accepted · 2026-11-12

## Context

- Before OPEX, the site read content synchronously: TypeScript dictionaries and `content/*.json`,
  through `getDictionary`, `getTubeProduct` and others. Hundreds of components call these loaders.
- The site must stay statically generated, because Lighthouse targets are part of the client
  contract (CLAUDE.md).
- A deploy or a build must never fail because OPEX is briefly unreachable.

## Decision

- **One async entry point.** Pages call `await ensureContent()` once, in the page,
  `generateMetadata`, the sitemap or the llms routes. The loaders stay synchronous and keep their
  return types, so components did not change.
- **One bundle, one tag.**
  - `/v1/delivery/bundle` returns every published entry. It is cached under the Next tag `opex`.
  - The publish webhook calls `revalidateTag("opex")`.
  - We did not tag per type or per entry: the bundle is small, global settings touch every page, and
    one tag cannot be forgotten on a new page.
- **Fallbacks, in order:**
  1. the last good bundle in memory;
  2. the generated snapshot (`packages/schema/generated/seed.json`, rebuilt by
     `pnpm --filter @arapoush/schema generate`);
  3. with OPEX unconfigured, the site's own files.
- **Locked content** (3D geometry, sizes, render marks) stays in `packages/schema/src/overrides.ts`.
  The site's code depends on its exact values.

## Consequences

- Any publish regenerates every page on its next visit. This is acceptable at this site's size, and
  rendered pages are static again right after.
- The snapshot must be regenerated when dictionaries or `content/*.json` change. CLAUDE.md states it.
- A one-hour revalidation is the safety net for a missed webhook.
