---
name: documentation-maintenance
description: Keep the Arapoush/OPEX documentation in step with the code. Use whenever a change touches API routes or contracts, request/response shapes, website route handlers, database migrations, configuration or environment variables, the content schema, authentication, integrations (webhooks, AraCMS, renderer, mail), shared UI components or their props, or application routes. Also use before committing such a change.
---

# Documentation maintenance (Arapoush / OPEX)

Docs live in the repo and are generated where possible. Your job is to decide the documentation impact of a change, update what is affected, and run the checks. Scripts decide pass or fail; do not argue with a failing check, fix the cause.

## 1. Find the impact (before editing docs)

If `graphify-out/graph.json` exists, use `graphify query "<what changed>"` or `graphify path` to see what else depends on the changed code. Then match the change against this table:

| You changed | Update | Generated? |
|---|---|---|
| A route handler, its inputs, its responses or errors (`apps/opex-api/src/**/routes.ts`) | The module's `contract.ts`: request schemas, every response status with schema and example, error codes with "when" | Yes: `pnpm docs:api` writes `docs/api/*.openapi.json`, `errors.md` and the Postman files |
| A new route | A contract in the module's `contract.ts`; add the group to `src/openapi/registry.ts` for a new module | Yes |
| A website route handler (`apps/web/app/**/route.ts`, sitemap, robots) | `apps/opex-api/src/openapi/site.ts` | Yes |
| A breaking API change | Bump `API_VERSION` (`src/openapi/specs.ts`), add a commit trailer `API-Break: approved <reason>`, and tell the AraCMS team when the partner spec changes | Check: `pnpm docs:breaking` |
| A webhook payload | `src/openapi/webhooks.ts` and `docs/api/guides/webhooks.md` | Partly |
| An environment variable (`apps/opex-api/src/config.ts`) | `infra/.env.example` (or the opex-api service in `infra/docker-compose.prod.yml`) and the related runbook | Check: `scripts/docs/check.mjs` |
| A migration (`src/db/migrations/*.sql`) | The relevant runbook or `docs/architecture/*`, including how to roll back | No |
| Auth, sessions, OAuth, signatures | `docs/api/guides/conventions.md`, `docs/opex/aracms-integration.md`, the ASVS matrix | No |
| A shared component or its props (`apps/*/components/**`) | Its `*.stories.tsx` (states, RTL fa and LTR en, viewports) | Props: autodocs |
| Architecture (a new service, data flow, a stack decision) | `docs/architecture/overview.md` or a new ADR in `docs/architecture/adr/` | No |
| A site route or section | `app/sitemap.ts`, `llms*.txt` and SEO metadata (CLAUDE.md rules) | No |

Not every code change needs docs: a refactor with the same behaviour, a fix inside a function, or a test change usually does not. Then say so in the commit: `Docs-Impact: none <reason>`.

## 2. Update

- Contracts are the source of truth for the API. Never edit `docs/api/*.json`, `errors.md` or the Postman files by hand.
- Handlers parse input with the contract's schemas (`X.y.body.parse(req.body)`), never with an inline zod schema.
- Responses must match their contract exactly: the test app fails on an undocumented status, an undocumented error code, or a body that does not match the schema.
- Write docs in plain language: what it does, who may call it, what goes wrong and when. Persian guides go under `docs/**/fa/`.

## 3. Verify (report real results)

```bash
pnpm docs:api
```

Regenerates the specs; commit them with the code.

```bash
pnpm --filter @arapoush/opex-api test
```

Runs the contract tests, route coverage and drift checks.

```bash
pnpm docs:check
```

Checks that the generated docs are current, that links and env docs resolve, and lints the OpenAPI.

```bash
pnpm docs:breaking
```

```bash
pnpm docs:stories
```

Runs every story in both Storybooks as a browser test (play steps plus axe). Needed whenever a shared component or its story changed; see `docs/storybook.md`.

Fails on unapproved breaking changes.

```bash
pnpm docs:coverage
```

Lists documented operations no test exercises; add them to `src/openapi/walkthrough.test.ts`.

The `commit-msg` hook runs the docs-impact rule, and CI runs all of the above. Never use `--no-verify` to get past them.
