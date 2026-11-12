## What and why

<!-- One or two sentences: what changes for users, operators or partners, and why. -->

## Documentation impact

<!-- Tick what applies. CI checks the deterministic parts (generated API docs, lint, breaking changes,
     links, env docs, docs-impact trailers); this list is for the reviewer. -->

- [ ] **API:** the route contracts were updated (responses, error codes, examples), `pnpm docs:api` was run, and the specs are committed.
- [ ] **Breaking API change:** API_VERSION was bumped, the commit has `API-Break: approved <reason>`, and the AraCMS team was told (if partner.openapi.json changed).
- [ ] **Configuration:** new or changed environment variables are in `infra/.env.example` or `infra/docker-compose.prod.yml`, and in the runbook.
- [ ] **Database migration:** the runbook or architecture docs mention what changed and how to roll back.
- [ ] **Shared components:** the stories were added or updated (props, RTL/LTR, states).
- [ ] **Architecture:** a new ADR in `docs/architecture/adr/`, or an update to the overview.
- [ ] **No documentation impact.** The commits carry `Docs-Impact: none <reason>`.

## Checks

- [ ] `pnpm check` passes (typecheck, lint, tests including the contract tests, build).
- [ ] Lighthouse on the production build: A11y, BP and SEO = 100, performance not lower (numbers below).
- [ ] RTL (fa) and LTR (en, tr) checked; reduced motion respected.

<!-- Lighthouse numbers (mobile / desktop): -->
