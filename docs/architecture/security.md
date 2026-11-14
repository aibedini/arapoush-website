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

1. Network allowlist (`CONSOLE_ALLOWED_CIDRS`), also on the sign-in routes.
2. Session.
3. CSRF on writes.
4. Permission (S1).

Each denial is audited.

- **Permissions (S1).** Every console route needs exactly one permission from the catalogue in
  `src/authz/permissions.ts` (`ROUTE_PERMISSIONS`). A route missing from the map is denied to
  everybody, and `authz/permissions.test.ts` fails. Effective permissions = the role's permissions
  + the operator's own `perm_allow` − its own `perm_deny`; `super_admin` always has all of them.
  Self-service routes (own session, password, preferences) only need a session.
- **Roles.** The built-in `viewer`, `auditor`, `operator` and `super_admin` keep the access the old
  role ranks gave (`BUILTIN_ROLES`). Custom roles live in the `roles` table. Nobody can give a
  permission they do not hold (`ESCALATION`), change their own permissions, or demote, disable or
  delete the last active super admin (`LAST_ADMIN`).
- **Managing operators (target protection).** Changing someone else (profile, role, permissions,
  password, MFA, sessions, delete) needs every permission *they* hold, and only a super admin
  manages a super admin (`ESCALATION`). Otherwise a custom "user admin" role could reset a super
  admin's password and authenticator and take the account over. Your own role, status, email,
  expiry and MFA are changed by another administrator (`SELF_CHANGE`).
- **Account lifecycle.**
  - New accounts and admin resets get a *temporary* password. OPEX can generate it (16 characters,
    about 80 bits): it is returned once, with `Cache-Control: no-store`, and never logged or
    audited.
  - While `must_change_password` is set, every non-self-service route answers
    `PASSWORD_CHANGE_REQUIRED`; changing the password lifts it. An admin reset also ends their
    sessions and lifts a lockout.
  - `access_expires_at` limits an account in time (contractors). After it, sign-in fails and
    live sessions end on their next request.
  - Delete is soft: credentials, sessions and team memberships are removed and the email is freed,
    but the row stays so the audit trail and past work still name the person. Disable is the
    reversible option.
  - Changing an operator's email or resetting their MFA ends their sessions.
- **Sessions.**
  - The `opex_session` cookie is HttpOnly and SameSite=Strict, and Secure in production.
  - Sessions expire after 15 minutes idle and 8 hours absolute.
  - MFA (TOTP, replay-protected) is mandatory for every operator.
- **Lockout.** Wrong passwords, sign-in codes and step-up codes all count (atomically) toward the
  exponential lockout; repeated step-up failures also end the session.
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

## Security review, November 2026 (S2)

A white-box review following the Cloudflare security-audit method (authentication, public inputs,
authorization, client side, deployment). Fixed:

| Finding | Fix |
|---|---|
| JSON-LD on the home FAQ and contact page was not escaped (stored XSS from content) | One serializer, `apps/web/lib/jsonld.ts`; test |
| Field paths accepted `__proto__` / `constructor` (prototype pollution) | `packages/schema/src/paths.ts` refuses them; test |
| A partner proposing at a parent path could rewrite locked or operator-only fields | `evaluate()` checks every field under the path (`subtreeHas`, `leafPaths`); tests |
| Operators could change locked fields through a parent path | Content PUT/PATCH use the same subtree check |
| Amending a change request kept earlier approvals (four-eyes bypass) | Amending clears approvals |
| Partner preview links showed every draft | Published content plus their own change request; never edit mode |
| Any visitor could switch on draft mode with a made-up token | The site asks OPEX to verify the token first |
| No lockout on the TOTP step (console and OAuth); racy lockout counter | Atomic counter for passwords and codes |
| Sign-in routes skipped the console network allowlist | Allowlist on login, MFA and enrolment |
| Refresh tokens kept scopes removed from the client | Intersected with the client's current scopes |
| One visitor could exhaust the shared form rate limit | Keyed on the end-user IP the website asserts |
| Viewers saw recent audit rows and unscanned uploads | Need `audit.read` / `media.upload` |
| Webhook URLs could target internal addresses (SSRF) | `src/net/ssrf.ts` on save and on each delivery |
| Console login open redirect; visual editor trusted any same-origin window | URL resolved against the origin; message source pinned |
| Configurator SVG colour from content went into markup unescaped | Hex colours only |
| xlsx import could allocate a huge grid or inflate a zip bomb | Row, column and inflated-size limits |
| The console host proxied partner, delivery and render routes | Rewrites limited to `/v1/manage` and docs |
| Console allowlist defaulted to the whole internet | Compose requires `CONSOLE_ALLOW` |
| Site had no CSP; `/media` SVG lost its sandbox through the site | `object-src`, `base-uri`, `form-action`, `frame-ancestors`; sandbox on `/media` |
| Next.js 15.5.28 advisories | Next 15.5.29 |
| Token comparison leaked the length | Both sides hashed first |

Still open (deployment decisions): a DMARC check before threading inbound mail into tickets,
Turnstile required in production when confirmation emails are on, the `__Host-` cookie prefix, and
pinning `install.sh` and the Caddy download by hash.
