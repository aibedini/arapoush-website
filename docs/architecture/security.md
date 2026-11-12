# Security model

[Architecture](README.md) › Security model

This page is a map. The detail is elsewhere:
- the requirements are in [plan §3](../opex/OPEX-PLAN.md);
- verification against OWASP ASVS is in [the ASVS matrix](../opex/asvs-matrix.md);
- operating procedures are in the [runbooks](../opex/runbooks/) (key rotation, incident response,
  security testing).

## Trust boundaries

| Caller | Reaches | Proves itself with | Can do |
|---|---|---|---|
| Visitor | Website only | Nothing | Read published pages; submit forms (through the site's server) |
| Website server | `/v1/delivery/*` | `Bearer DELIVERY_TOKEN` | Read **published** content; submit form entries |
| Website server (editor's preview) | `/v1/delivery/preview` | `opex-preview`: signed, short-lived token | Read one draft view |
| Operator | `/v1/manage/*` via the console | Session cookie + CSRF header, MFA, network allowlist | Depends on role (below) |
| AraCMS | `/v1/partner/*` | OAuth 2.1 access token bound with DPoP; signed writes; optional mTLS | Only its grants; writes become change requests |
| 3D renderer | `/v1/render/*` | `Bearer RENDER_TOKEN` | Claim jobs, upload renders, report results |
| Prometheus | `/metrics` | `Bearer METRICS_TOKEN` | Read metrics |
| OPEX → website | `/api/opex/revalidate` | HMAC signature with timestamp; event id used once | Clear the content cache |

**The website never holds an operator credential.**
- Its delivery token reads published content and submits forms, nothing else.
- Every auth kind is declared per route in its contract (`AuthKind` in
  `apps/opex-api/src/openapi/contract.ts`).
- The tests fail if a route answers in a way its contract does not declare.

## Console (operators)

Guard order, in `auth/guards.ts`:

1. Network allowlist (`CONSOLE_ALLOWED_CIDRS`).
2. Session.
3. CSRF on writes.
4. Role.

Each denial is audited.

- **Sessions.**
  - The `opex_session` cookie is HttpOnly and SameSite=Strict, and Secure in production.
  - Sessions expire after 15 minutes idle and 8 hours absolute.
  - MFA (TOTP, replay-protected) is mandatory for every operator.
- **Roles.** The order is `viewer` < `auditor` < `operator` < `super_admin`. Auditors read
  everything and never pass a write guard.
- **Step-up.**
  - Sensitive actions need a second factor from the last 5 minutes. These include partner keys, user
    roles and locked fields.
  - Locked content (3D geometry, sizes, render marks) can only change this way, by a super admin.

## Partner API (AraCMS)

| Layer | Mechanism |
|---|---|
| Client authentication | `private_key_jwt` (ES256 assertion, `jti` used once) |
| Token | OAuth 2.1 `client_credentials`, DPoP-bound: a stolen token is useless without the key |
| Write integrity | RFC 9421 HTTP Message Signature (details below) |
| Retries | `Idempotency-Key`: the same key and body replays the first answer; the same key with a different body is refused |
| Access | Network allowlist and token scopes, then **grants** per content type, field and locale (`authz/grants.ts`) |
| Effect | Writes never touch drafts: they become change requests under approval policies |
| Transport (optional) | mTLS at Caddy with the CA that issues AraCMS client certificates |

The RFC 9421 signature on writes:
- covers method, path, `Content-Digest` (RFC 9530, the exact bytes), `Idempotency-Key` and
  `X-End-User-IP`;
- must be at most 60 seconds old;
- carries a nonce that is used once.

Replay caches (signature nonces, DPoP `jti`, assertion `jti`) share the `jti_seen` table.

## Content and output safety

- **Validation.**
  - Every request is parsed with its route contract's zod schema.
  - Every response is checked against the contract in the tests (docs/DOCS-PLAN.md, D2).
- **Rich text.** Content text is rendered as React elements. The only raw HTML the site writes is
  JSON-LD, serialized with `<` escaped.
- **Media.**
  - The real type of an upload comes from its magic bytes, never from its name or `Content-Type`.
  - Raster images are always re-encoded to WebP. This strips EXIF and GPS data and breaks
    polyglot files.
  - SVG and PDF files are checked for active content.
  - Files are scanned by ClamAV when `CLAMAV` is set.
- **Preview.** Preview responses are `no-store` and `noindex`. The edit bridge loads only in draft
  mode with the edit cookie.
- **Public docs.** `/docs/partner` is served under a strict CSP. Its scripts are self-hosted, with
  no CDN.

## Audit

- **What is recorded.**
  - Every change, every denial and every sensitive read (for example `ticket.read`) writes an
    `audit_events` row.
  - Each row records who did it (principal, role, MFA), from where (the IP after trusted-proxy
    parsing), what changed (a field-level diff) and why.
- **Tamper evidence.**
  - Rows form a **hash chain**: `hash = sha256(prev_hash + record)`, written under an advisory lock
    so the chain stays linear.
  - The archive job appends new rows to read-only JSONL files.
  - A manifest is signed with OPEX's ES256 key (`/.well-known/jwks.json`).
  - Stored on WORM storage (S3 Object Lock), the archive exposes any later edit of the database.

## Secrets

All secrets come from the environment; none are in the repository. Each is documented in
`infra/.env.example`, and `pnpm docs:check` fails on an undocumented one.

Key and token rotation is in [the key rotation runbook](../opex/runbooks/key-rotation.md).
