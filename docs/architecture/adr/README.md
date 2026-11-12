# Architecture decision records

[Architecture](../README.md) › ADRs

An ADR records a decision that fixed or changed the design: its context, the choice and its cost.
ADRs are not edited after acceptance. A later decision supersedes one in a new ADR.

| # | Decision | Status |
|---|---|---|
| [0001](0001-runtime-stack.md) | OPEX runtime stack: Fastify, plain SQL, PGlite, in-process jobs, a focused OAuth subset; isolated renderer | Accepted 2026-11-11 |
| [0002](0002-content-behind-loaders.md) | The site reads OPEX behind its existing loaders, with one cache tag and a snapshot fallback | Accepted 2026-11-12 |
| [0003](0003-contracts-are-the-api-docs.md) | Route contracts are the single source of validation, OpenAPI and tests | Accepted 2026-11-12 |
| [0004](0004-visual-editor-in-the-real-page.md) | The visual editor edits the real site page through a draft-mode bridge | Accepted 2026-11-12 |
| [0005](0005-documentation-enforced-per-commit.md) | Documentation is enforced per commit by a hook and CI | Accepted 2026-11-12 |

## Writing one

Copy the shape of 0002:
- Context: what forced a decision.
- Decision: what we do.
- Consequences: what it costs and what it rules out.

Number it next in sequence and add it to this table in the same commit as the change.
