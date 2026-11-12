# ADR 0005: Documentation is enforced per commit

Status: accepted · 2026-11-12

## Context

- The documentation plan (docs/DOCS-PLAN.md) asked for docs that stay correct without a "docs
  sprint".
- Generated API docs solve routes. They do not cover migrations, configuration, auth, integrations
  or shared components.

## Decision

- **Local hooks**, installed by `pnpm install` (`scripts/hooks/install.mjs`), sit next to graphify's
  own hooks:
  - `pre-commit` checks that the API docs match the routes, and checks links and env docs, when
    those files are staged;
  - `commit-msg` runs `scripts/docs/impact.mjs`.
- **The impact rule.** A commit that touches a documented surface must also do one of two things:
  - change documentation: `docs/**`, a README, CLAUDE.md, a story, `infra/.env.example` or a skill;
  - carry `Docs-Impact: none <reason>`.

  Documented surfaces are routes, contracts, migrations, config, the schema, auth, integrations and
  shared components.
- **CI** runs the same checks on every commit in a pull request. It also runs the breaking-change
  gate and the story tests (`storybook` job), so hooks skipped locally are caught.
- `pnpm changelog` builds `docs/changelog.md` from Conventional Commits.

## Consequences

- Some commits carry a one-line `Docs-Impact: none` trailer. That trailer is the record that someone
  looked.
- Branch protection must require the `docs` and `storybook` jobs. `CONTRIBUTING.md` lists the
  settings.
