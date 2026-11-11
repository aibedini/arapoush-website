# OWASP ASVS 4.0.3 control matrix (OPEX)

Target L2, with L3 on authentication and audit. "Phase" is where the control is built; "Where" is
the code or config that implements it. Update this file in the same PR as the control.

| ASVS | Control | Phase | Where |
|---|---|---|---|
| V1.4 | Central access control at one trusted enforcement point | P2/P6 | `src/auth/guards.ts`, `src/authz/grants.ts` |
| V2.1 | Passwords ≥ 12 chars, breached-password check | P2 | `src/auth/password.ts` |
| V2.4 | Argon2id hashing | P2 | `src/auth/password.ts` |
| V2.8 | TOTP MFA, single use per time step | P2 | `src/auth/totp.ts`, `credentials.last_used_step` |
| V2.2 | Anti-automation: lockout, rate limits | P1/P2 | `@fastify/rate-limit`, `principals.failed_logins/locked_until` |
| V3.2 | Session ids random, httpOnly, Secure, SameSite=Strict cookies | P2 | `src/auth/sessions.ts` |
| V3.3 | Idle (15 min) and absolute (8 h) timeouts, revocation | P2 | `src/auth/sessions.ts` |
| V3.5 | Token-based sessions: short-lived JWT (5 min), audience, DPoP binding, refresh rotation | P2 | `src/oauth/*` |
| V4.1 | Deny by default; every deny audited | P2/P6 | guards, `authz.denied` events |
| V4.2 | IDOR: grants evaluated per entry/field/locale | P6 | `src/authz/grants.ts` |
| V4.3 | Step-up for administrative actions | P2 | `requireStepUp` |
| V5.1 | Input validation, strict schemas (unknown fields rejected) | P1/P3 | `@arapoush/schema` `validate`, zod bodies |
| V5.2 | Sanitisation: bidi controls, NFC, URL scheme allowlist, no raw HTML | P1 | `packages/schema/src/sanitize.ts` |
| V5.3 | Output encoding: JSON only; site escapes JSON-LD | P1/P5 | API responses, `apps/web` JSON-LD |
| V6.2 | Approved crypto: SHA-256, ES256, AES-256-GCM, Argon2id | P1–P8 | `src/ids.ts`, `src/oauth/keys.ts`, `src/inquiries/crypto.ts` |
| V7.1 | No secrets/tokens/bodies in logs | P1 | pino `redact` in `src/app.ts` |
| V7.2 | Security events logged (auth, authz, admin, data change) | P1+ | `src/audit/audit.ts` |
| V7.3 | Log integrity: append-only + hash chain + verification | P1 | migration `001_init.sql` triggers, `verifyChain`, signed write-once archive (`src/audit/archive.ts`) |
| V8.1 | No sensitive data cached: `Cache-Control: no-store` on API | P1 | `src/app.ts` |
| V9.1 | TLS everywhere, HSTS in production | P1/P9 | helmet HSTS, `infra/Caddyfile` |
| V10.3 | Dependency integrity: lockfile, frozen installs, audit in CI | P0 | `pnpm-lock.yaml`, CI `dependency-audit` (fails on high), versions pinned ≥ 2 weeks old |
| V12.1 | Upload size limits | P3 | multipart limits, `src/media/*` |
| V12.2 | File type by magic bytes, re-encoding, no SVG script, PDF checks | P3 | `src/media/inspect.ts`, `src/media/service.ts` |
| V12.4 | Uploads stored outside webroot, served with safe headers | P3 | `MEDIA_DIR`, `src/media/routes.ts` |
| V13.1 | API: problem+json, no stack traces | P1 | `src/http/problem.ts` |
| V13.2 | Content-type enforcement, CSRF for cookie-auth APIs | P2 | `requireCsrf` |
| V14.4 | Security headers (CSP none, frame-ancestors none, nosniff) | P1 | helmet in `src/app.ts` |
| V13.1 | API request integrity: RFC 9421 signatures (±60 s, single-use nonce, body digest), idempotency keys | P6 | `src/partner/integrity.ts` |
| V13.2 | RESTful auth per endpoint, problem+json errors, OpenAPI contract | P6 | `src/partner/routes.ts`, `/v1/partner/openapi.json` |
| V8.3 | Personal data encrypted at rest, every read audited, 2-year retention, erasure | P8 | `src/inquiries/*` |
| V11.1 | Business logic: change requests merge three-way; stale proposals cannot overwrite | P6 | `src/cr/merge.ts`, `src/cr/service.ts` |
| V14.1 | Hardened build/deploy: non-root containers, read-only API/console filesystems, internal network, console IP allowlist | P9 | `infra/docker-compose.prod.yml`, `infra/Caddyfile` |
| V14.2 | Security headers: CSP with nonces (console), frame-ancestors, HSTS, nosniff | P4/P7/P9 | `apps/opex-console/middleware.ts`, `apps/web/next.config.ts`, Caddy |
| V7.4 | Monitoring and alerting on security events (chain broken, token reuse, login failures) | P9 | `src/ops/metrics.ts`, `infra/prometheus-alerts.yml` |
