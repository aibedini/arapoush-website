# Documentation system: plan (draft for review)

Status: **agreed 2026-11-12**. Build order is D1 → D6, one commit per phase.

Progress: **D1–D4 done**.
- Git hooks run the fast docs checks (pre-commit) and the docs-impact rule (commit-msg); CI job `docs` runs everything.
- The documentation-maintenance skill, the PR template, CONTRIBUTING.md with branch protection, and the generated changelog are in place.
- References are live: `/docs/partner` (public) and `/v1/manage/docs` (console).
- Error catalogue, Postman collection with environments, and guides in English and Persian.
- Contract tests check every response the tests receive against its contract; 127 of 127 operations are exercised.
- The breaking-change check is deterministic and needs no external binary.
- 127 OPEX operations, 3 webhooks and 7 website routes are generated into `docs/api/` and pass Redocly lint (0 problems).
- Tests enforce route coverage and that the committed specs match the code.

## What exists today (facts from the repo)

| Surface | Where | Count | Today |
|---|---|---|---|
| OPEX **Manage** API (console) | `apps/opex-api/src/**/routes.ts`, `cr/manage.ts`, … | ~70 routes | zod validates every request; no reference docs |
| OPEX **Partner** API (AraCMS) | `src/partner/routes.ts` | 7 routes + OAuth (4) | hand-written OpenAPI in `src/partner/openapi.ts`; prose in `docs/opex/aracms-integration.md` |
| OPEX **Delivery** API (site → OPEX) | `src/delivery/*`, `src/forms/routes.ts` | 5 | none |
| OPEX **Render** API (renderer → OPEX) | `src/render/routes.ts` | 4 | runbook only |
| Ops | `/healthz`, `/readyz`, `/metrics`, `/.well-known/*`, `/media/:file` | 6 | runbooks |
| **Webhooks** OPEX sends | site `content.published`, partner `cr.*` | 2 kinds | prose only |
| **Site** route handlers (Next.js) | `apps/web/app/api/**`, `llms*.txt`, `sitemap`, `robots` | 5 + 4 | none |
| Frontend components | site `components/**` (≈60), console `components/**` (≈15) | — | none; no Storybook |

Requests are already described by zod schemas. Responses are not, which is the main gap.

## Recommendation: code-first contracts, generated OpenAPI 3.1

Your four-phase plan is right in spirit. I would change five things:

1. **Contracts live in code, next to the handlers, not in a hand-written YAML.**
   - Each route gets a small contract: method, path, auth, request zod schemas, response zod
     schemas per status, errors, examples, and a summary.
   - The handler parses with the same schemas it documents, so docs and code cannot disagree.
   - `pnpm docs:api` generates `docs/api/openapi.yaml` from the contracts, using zod 4's built-in
     `z.toJSONSchema`. No new runtime dependency is needed.
   - The generated file is committed, and CI fails if regenerating changes it (drift detection).
   - A hand-written YAML would drift within weeks; the existing `partner/openapi.ts` already has.
2. **Responses are verified, not just described.**
   - The existing API tests (40+) get a helper that checks every response they receive against the
     route's documented response schema.
   - A route without a documented response for a status it returns fails the build. This is the
     contract test, and it runs on PGlite, so it needs no staging server.
3. **Several audiences, several outputs, from one spec.** Each operation is tagged with its audience.

   | Audience | Gets | Exposure |
   |---|---|---|
   | Partner (AraCMS PHP team) | Partner API + OAuth/DPoP + request signing + webhooks, with PHP and cURL examples | `opex.arapoush.com/docs/partner` (public, no internals) |
   | Internal developers | Manage, Delivery, Render and Ops, plus the site route handlers | inside the console at `/docs` (operator login) |
   | Postman | a collection generated from the spec, with placeholder environments | file in the repo, CI artifact |

   Your plan publishes everything in one portal. That would expose internal endpoints, which your
   own rules forbid, so the audience split is necessary.
4. **Storybook comes after the API docs, with a narrow scope.**
   - The site's sections are server components with GSAP, Three.js and real content. Storybook
     stories for them would be costly and fragile.
   - The good targets are the console UI kit (`ui.tsx`, FieldEditor, tickets inbox parts), the site's
     form, blocks, buttons and header, and the configurator controls.
   - That is about 25 components, with RTL/LTR, three viewports, a11y and interaction tests.
5. **Per-commit enforcement is deterministic**, as your plan says, and never an AI judgment. AI
   (Claude, through a skill) only writes the docs; scripts decide pass or fail.

## Phases (each phase is its own commit, like P0–P13)

**D1: Contracts + generated OpenAPI**
- Add a `defineRoute()` contract helper to the API.
- Convert every route group, in this order: partner, delivery and forms, render, manage, ops.
- Generate `docs/api/openapi.yaml` (OpenAPI 3.1) with a `webhooks` section.
- Replace the hand-written `partner/openapi.ts` with the generated partner view (same URL).
- Document the site's route handlers too, in a second spec, `docs/api/site.openapi.yaml`.

**D2: Verification**
- Response validation in all API tests.
- Redocly CLI lint, with a ruleset of examples required, error schemas required and operationIds
  unique.
- `oasdiff` breaking-change check against `main`. A break needs an explicit
  `API-Break: approved <reason>` line in the commit message, plus a version bump of the affected
  audience.

**D3: Readable references**
- Scalar API reference: public partner view at `/docs/partner` on the API; full internal view in
  the console at `/docs`.
- Guides in Persian and English: authentication (sessions, CSRF, step-up, OAuth/DPoP, request
  signatures), errors (problem+json catalogue with every `code`), rate limits, idempotency,
  pagination, webhooks and their signature verification.
- A generated Postman collection, environments with placeholders, and the sync workflow.

**D4: Continuous docs**
- `pnpm docs:check`, run locally and in CI:
  - regenerate the spec and fail on diff;
  - lint;
  - oasdiff;
  - link check;
  - the docs-impact rule: changes to routes, migrations, schema or components require a docs change
    or a `Docs-Impact: none <reason>` commit trailer.
- Git hooks:
  - `pre-commit` runs the fast part (spec regenerate and diff, lint);
  - `post-commit` runs `graphify update .`.
- CI job `docs` blocks merge; recommended branch-protection settings are written down.
- `.claude/skills/documentation-maintenance/SKILL.md` and a CLAUDE.md rule: every change checks its
  documentation impact.
- A PR template with a "Documentation impact" section.
- `docs/changelog.md` is generated from Conventional Commits per release.

**D5: Storybook (narrow)**
- `@storybook/nextjs-vite`, chosen if it builds with Next 15.5 and our CSS modules; webpack
  otherwise.
- About 25 components across site and console, with autodocs, the a11y addon, interaction tests and
  RTL/LTR plus three viewports.
- The Storybook build is checked in CI. The MCP addon is optional.

**D6: Architecture docs**
- `docs/architecture/`: system overview, data flow (content → delivery → site → revalidate),
  security model, ADRs.
- Diagrams are generated, using the graph from graphify as a cross-check.

Estimated size: D1 is the largest (about 120 routes). D2 and D3 are medium; D4 and D6 are small;
D5 is medium.

## Decisions (2026-11-12)

1. **Hosting:** split. Partner docs are public at `opex.arapoush.com/docs/partner`; the full internal
   reference lives inside the console behind login.
2. **Storybook:** narrow scope (about 25 components), after the API docs (D5).
3. **Enforcement:** a local pre-commit hook plus CI blocking merges.
4. **Postman:** a generated collection and placeholder environments in the repo, no workspace sync.
5. **Guides:** Persian and English. English for the PHP partner.
