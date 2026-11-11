# ADR 0001: OPEX runtime stack

Status: accepted · 2026-11-11

## Context

The plan (§1) named NestJS, Drizzle, BullMQ/Redis and an `oidc-provider` OIDC server. While building
P1 we chose smaller pieces that meet the same requirements with less code to review and audit.

## Decision

| Plan | Built | Why it still meets the requirement |
|---|---|---|
| NestJS on Fastify | **Fastify 5 directly**, route modules + `preHandler` guards | Same request pipeline (auth → network → scope → grant → lock → policy) as hooks; far less framework surface |
| Drizzle ORM | **Parameterised SQL** through a 3-function port (`q`, `tx`, `close`) | Every value is a bind parameter; SQL is explicit, reviewable and identical on Postgres and PGlite |
| Compile step | **None**: erasable TypeScript run by Node ≥ 22.18 type stripping | Shipped code is the reviewed code; `tsc --noEmit` still type-checks |
| Dev database | **PGlite** (PostgreSQL compiled to WASM) when `DATABASE_URL` is unset | Triggers, advisory locks, jsonb behave like production; tests need no Docker |
| BullMQ + Redis | **In-process interval jobs** over Postgres tables (`webhook_deliveries`, `entries.scheduled_at`) | Jobs are durable rows, retried with backoff; single-instance v1. Move to a queue when running >1 API instance (plan §12 HA) |
| `oidc-provider` | **Purpose-built OAuth 2.1 subset** with `jose`: `authorization_code`+PKCE (S256), `refresh_token` (rotation + reuse detection), `client_credentials`, `private_key_jwt` client auth, DPoP-bound tokens, JWKS endpoint | Exactly the flows the plan requires, nothing more to misconfigure |
| WebAuthn + TOTP | **TOTP** in v1 (RFC 6238, replay-protected); WebAuthn tracked for P9 | MFA is mandatory for every human in v1 |

## Consequences

- Horizontal scaling (two API instances) needs the job runner moved to a queue and session or rate
  limit state shared. Tracked in plan §12 (HA v2).
- No ORM migrations generator: migrations are hand-written SQL files, applied in order inside
  transactions (`src/db/migrate.ts`).
