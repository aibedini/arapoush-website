# OPEX: content core, operator console and API for the Arapoush website

Implementation specification. Version 1.0, 2026-11-11.

Audience: the engineer or AI agent that builds it. Every phase lists its deliverables and its
acceptance criteria. Read §0–§4 before starting any phase.

---

## 0. Context and goals

The Arapoush website (`/`, Next.js 15 App Router; locales `fa` (default, RTL), `en`, `tr`) is
currently content-in-code:
- texts live in `lib/i18n/dictionaries/{fa,en,tr}.ts`;
- structured content lives in `content/*.json`;
- image paths are hard-coded in components.

Every change needs a developer and a deploy.

Three parties are involved:
- **OPEX** is our company. It is the system's **single source of truth and operator**.
- **Arapoush** is the client. It runs **AraCMS**, a PHP admin panel that talks to OPEX **only through
  OPEX's API**.
- **The website** reads published content from OPEX.

### Goals

1. Every **text and image** on every page becomes content managed in OPEX, in all three locales.
2. **OPEX operators** (our staff) have full access to everything. OPEX is the core: content, media,
   publication, permissions, approvals and audit all live in OPEX and nowhere else.
3. **AraCMS** (client staff) can read and propose changes **only where an operator granted access**,
   down to content type, entry, field and locale.
4. Every AraCMS change is a **change request**. An operator approves or rejects it, unless the
   operator configured an **auto-approve policy** for that scope.
5. **Security first.** The target is OWASP ASVS 4.0.3 Level 2.
6. **Complete, tamper-evident audit:**
   - who: person and client app;
   - what: before/after diff;
   - where: resource and field;
   - when, from which IP, with which user agent;
   - with which session, token and request id.
7. **Zero regression on the site:**
   - Lighthouse rules in `CLAUDE.md` stay (A11y / BP / SEO = 100);
   - pages stay statically generated;
   - SEO / JSON-LD / sitemap / llms keep working and become content-driven.
8. **Extensible:** a new page, section or field is added by declaring a schema once (§5), not by
   writing new endpoints or new UI.

### Non-goals (v1)

- Three.js scenes stay **code-owned and locked**:
  - geometry, poses, physics, shader parameters;
  - effervescent `sizes[].render` marks, `renderPxPerMm`, cap `parts[]` x/y positions;
  - the configurator model (shapes, diameters, closures, compat matrix, 3D `model` keys).

  They are exposed **read-only** in OPEX (visible, versioned, not editable by AraCMS, editable by
  OPEX super-admins only behind a "locked" flag). Their **texts and the photos around them are
  editable** (see §6). A later phase (§13, P10) can open them with a render pipeline.
- No layout, CSS or animation editing. The design is ours; content is theirs.
- AraCMS UI is not built by us. We ship its **API, SDK docs and a reference PHP client** (§9.6).

---

## 1. Architecture

```
                         ┌───────────────────────────── OPEX (our infra) ─────────────────────────────┐
  Operators (our staff)  │                                                                              │
  ── browser ──► opex-console (Next.js, /console)  ──►  opex-api  (NestJS, TypeScript)                 │
                         │                                 │   ├── Management API  /v1/manage/*  (private)│
  AraCMS (client, PHP)   │                                 │   ├── Partner API     /v1/partner/* (AraCMS) │
  ── server-to-server ──►│  WAF / reverse proxy ──────────►│   ├── Delivery API    /v1/delivery/*(site)  │
     (OAuth2 + mTLS)     │                                 │   └── Auth server     /oauth/*, /login      │
                         │                                 │                                            │
                         │      PostgreSQL 16 (primary + PITR)   Redis 7 (queues, rate limits, sessions) │
                         │      Object storage (S3 / MinIO): media-private, media-public                 │
                         │      Worker (BullMQ): image pipeline, AV scan, webhooks, publish fan-out      │
                         │      Audit sink: append-only table + hash chain → WORM export (S3 object lock)│
                         │      Logs/metrics: OpenTelemetry → Loki/Prometheus/Grafana, alerting          │
                         └──────────────────────────────────────────────────────────────────────────────┘
                                                      │ signed webhook (publish)
                                                      ▼
                         Website (this repo, Next.js) ── build/ISR reads Delivery API ──► visitors
```

### Technology decisions (fixed for v1)

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (Node 22 LTS) | Same language as the site, so content schemas are shared as code (§5) |
| Repo | pnpm workspaces + Turborepo monorepo | Site, API, console and shared packages version together |
| API framework | NestJS 10 on Fastify adapter | Modules, guards and interceptors map 1:1 to auth / permission / audit concerns; mature |
| DB | PostgreSQL 16; Drizzle ORM; SQL migrations committed | Row-level control, JSONB for localized fields, triggers for audit immutability |
| Validation | Zod (shared) → JSON Schema → OpenAPI 3.1 | One schema drives API validation, console forms, AraCMS docs and site types |
| Queue | BullMQ on Redis | Image processing, AV scan, webhooks, scheduled publish |
| Media | S3-compatible storage (MinIO on-prem or any S3); `sharp` for derivatives; ClamAV | Private originals, public derivatives only after approval |
| Console UI | Next.js 15 + shadcn/ui + TanStack Query/Table; RTL-aware | Same stack as the site; schema-driven forms |
| Auth | Built-in OAuth 2.1 / OIDC provider in opex-api (`oidc-provider` lib) + WebAuthn/TOTP | We must own identities to log "who" with certainty |
| Observability | OpenTelemetry SDK, pino JSON logs, Prometheus, Grafana, Loki, Alertmanager | Traces link request → audit record |
| Deploy | Docker images; docker compose for single host, Helm-ready layout | Matches the existing `Dockerfile` / `install.sh` model |

**Why not PHP for OPEX?** AraCMS is PHP and stays PHP. OPEX shares types with the Next.js site:
content schemas, image shape `{src,width,height}`, localized text. A TypeScript core removes a whole
class of drift bugs. PHP only meets OPEX at a documented HTTP boundary (OpenAPI), which is the clean
contract we want anyway.

### Monorepo layout (target)

```
/apps/web            ← the current website (moved from repo root)
/apps/opex-api       ← NestJS API + OIDC provider + workers
/apps/opex-console   ← operator console (Next.js)
/packages/schema     ← content type definitions (Zod), locales, shared types, JSON-Schema/OpenAPI generators
/packages/sdk-ts     ← typed client for the Delivery & Management APIs (used by web + console)
/packages/audit      ← audit event types + diff utilities (shared by api and console)
/packages/config     ← eslint, tsconfig, prettier presets
/docs/opex           ← this plan, ADRs, runbooks, AraCMS integration guide
/infra               ← docker compose, Caddy/Nginx config, backup scripts, Grafana dashboards
/clients/php-reference ← minimal PHP 8.3 reference client for AraCMS (§9.6)
```

Moving the site into `apps/web` is a pure move (P0). Keep `install.sh` and the updater working by
pointing them at `apps/web` (§12).

---

## 2. Domain model

### 2.1 Core entities

- **Tenant:** `arapoush`. Multi-tenant ready from day one (`tenant_id` on every row); a single tenant
  in v1.
- **Locale:** `fa` (default, RTL), `en`, `tr`. Every localized field stores `{fa, en, tr}`. Fallback
  order per field: requested → `en` → `fa`.
- **ContentType:** declared in code in `packages/schema` (§5). It is not created at runtime. Examples:
  `page.home.hero`, `product.effervescent`, `global.site`.
- **Entry:** one instance of a content type, such as the home hero or the printing page. Singletons
  (most pages) have exactly one entry. Collections (articles, partners, certifications, samples) have
  many.
- **Revision:** an immutable snapshot of an entry's full data. Every saved change creates one. The
  entry points to `draft_revision_id` and `published_revision_id`.
- **Asset:** an uploaded file. Fields: original (private), metadata (mime, bytes, sha256, width,
  height, dominant colour, blurhash) and derivatives (public after publish). Alt text is per locale
  on the **usage**, not the asset.
- **ChangeRequest (CR):** a proposed set of field changes against a **base revision**. It holds one
  or more `ChangeItem`s (entry, field path, locale, old value, new value) and moves through a state
  machine (§7).
- **ApprovalPolicy:** operator-defined rules deciding whether a CR needs manual approval
  (§7.3).
- **Grant:** what a principal (an AraCMS client, role or user) may do on which scope (§4.3).
- **Publication:** the act of making a revision live. It triggers site revalidation (§10).
- **AuditEvent:** an append-only, hash-chained record of every security-relevant or data-changing
  event (§8).

### 2.2 Tables (PostgreSQL; all have `tenant_id`, `created_at`, ULID primary keys)

```
principals(id, kind: 'operator'|'partner_user'|'service', display_name, email, status, mfa_required, created_by)
operator_profiles(principal_id, role: 'super_admin'|'operator'|'auditor'|'viewer')
partner_clients(id, name 'AraCMS', status, allowed_cidrs inet[], mtls_cert_fingerprint, contact, created_by)
partner_users(principal_id, partner_client_id, external_ref, status)            -- humans inside AraCMS
credentials(principal_id, kind: 'password'|'totp'|'webauthn', secret_ref, created_at, last_used_at)
oauth_clients(id, partner_client_id, client_id, auth_method 'private_key_jwt', jwks_uri|jwks, grant_types, redirect_uris, scopes)
sessions(id, principal_id, client_id, ip, user_agent, created_at, last_seen_at, revoked_at, revoke_reason)
tokens(jti, session_id, kind, expires_at, revoked_at)                           -- for revocation lists

content_types(key, version, schema_hash, locked boolean)                        -- registered from code at boot
entries(id, type_key, slug, status, draft_revision_id, published_revision_id, scheduled_at, locked)
revisions(id, entry_id, number, data jsonb, data_hash, parent_revision_id, author_principal_id, via_cr_id, created_at)
assets(id, sha256, mime, bytes, width, height, blurhash, status: 'quarantine'|'clean'|'rejected', original_key, uploaded_by)
asset_variants(asset_id, format, width, key, bytes)
asset_usages(asset_id, entry_id, field_path)                                    -- maintained on save; blocks deleting used assets

change_requests(id, partner_client_id, author_principal_id, title, note, state, base_revision_ids jsonb,
                policy_decision jsonb, decided_by, decided_at, decision_reason, published_at, idempotency_key)
change_items(id, cr_id, entry_id, field_path, locale, op: 'set'|'insert'|'remove'|'move', old_value jsonb, new_value jsonb)
approval_policies(id, name, priority, scope jsonb, conditions jsonb, effect: 'auto_approve'|'require_review'|'deny', enabled, created_by)
grants(id, subject_kind, subject_id, scope jsonb, actions text[], expires_at, created_by)

publications(id, entry_ids text[], revision_ids text[], by_principal_id, trigger: 'manual'|'cr'|'schedule'|'rollback', status, webhook_status)
webhooks(id, target_url, secret_ref, events text[], active)
webhook_deliveries(id, webhook_id, event_id, attempt, status_code, latency_ms, next_retry_at)

audit_events(seq bigserial, id, ts, tenant_id, actor jsonb, action, resource jsonb, request jsonb,
             changes jsonb, result, reason, prev_hash bytea, hash bytea)        -- append-only (§8.2)
idempotency_keys(key, principal_id, request_hash, response jsonb, expires_at)
```

### 2.3 Field paths

A field path addresses any value inside an entry, in JSON Pointer style with stable ids instead of
array indexes:
- `/title` (localized: `/title@fa`);
- `/slides[id=packaging]/lead@en`;
- `/items[id=flexo]/capabilities[2]@tr`.

Arrays of objects **must** carry a stable `id`. Index-based paths are allowed only inside arrays of
primitives. Field paths are used in grants, policies, change items, audit and the console.

---

## 3. Security architecture

Target: **OWASP ASVS 4.0.3 L2**, with L3 controls on authentication and audit. Each control below
maps to an ASVS chapter; record the mapping in `docs/opex/asvs-matrix.md` as P1 work.

### 3.1 Network and transport

- **TLS:**
  - TLS 1.2+ only (prefer 1.3) and HSTS (`max-age=63072000; includeSubDomains; preload`).
  - OCSP stapling.
  - Certificates via ACME.
- **Edge:**
  - Reverse proxy: Caddy or Nginx, with ModSecurity + OWASP CRS, or the cloud WAF in front.
  - Request size limits: 1 MB JSON, 25 MB upload (configurable).
- **Separate hostnames per audience:**
  - `console.opex…`: operators; IP allowlist + SSO session.
  - `api.opex…/v1/partner`: AraCMS servers only. **mTLS** (client cert pinned per partner) **and**
    a CIDR allowlist from `partner_clients.allowed_cidrs`.
  - `api.opex…/v1/manage`: console backend only; not reachable from the internet except via the
    console host.
  - `cdn/content…/v1/delivery`: the website. Read-only, published data only, cacheable, rate-limited.
- **Network placement:** the DB, Redis and object storage sit on a private network with no public
  ports. Workers have no inbound ports.
- **SSRF:**
  - Outbound HTTP (webhooks) goes through an egress allowlist.
  - The resolved IP is rejected if private or loopback, unless explicitly configured.

### 3.2 Identity and authentication

OPEX hosts its own **OIDC provider**: it is the identity authority.

**Operators:**
- Password (Argon2id, `m=64MB,t=3,p=1`, 12+ chars, breached-password check via k-anonymity HIBP).
- **Mandatory MFA:** WebAuthn preferred, TOTP fallback.
- 15 min idle and 8 h absolute session timeout.
- Re-authentication (step-up) for sensitive actions: grants, policies, publishing locked types,
  deleting, exporting audit.

**AraCMS (partner):**
- **Machine identity:** an OAuth2 confidential client using `private_key_jwt` client authentication
  (no shared secrets), plus mTLS. Its keys live in AraCMS's server-side secret store; it publishes a
  JWKS or registers its public key with OPEX.
- **Human identity:** each AraCMS user who edits content must be an OPEX **partner_user**, signed in
  through **Authorization Code + PKCE**, with OPEX as the IdP. The login page is OPEX's own, MFA is
  mandatory, and the AraCMS PHP app is the confidential client that keeps the tokens server-side.
- **Why:** OPEX then *knows* who edited, and doesn't have to trust an AraCMS claim. It records:
  - the verified user (`sub`);
  - the client (`azp`);
  - the end-user IP as seen by OPEX at login;
  - the AraCMS server IP on each API call.
- **Forwarded end-user IP:** AraCMS also forwards it in a header (`X-End-User-IP`), signed into the
  request (§3.4). It is stored as `asserted_end_user_ip`, flagged as asserted.
- **Automation without a human** (rare; for example nightly sync): `client_credentials` with a
  `service` principal. Narrow scopes; those changes always need manual approval unless a policy says
  otherwise.
- **Provisioning:** partner users are created only by operators, or by invitation that an operator
  approves. AraCMS can **request** a user; it cannot create one.

**Tokens:**
- Access tokens are JWTs (ES256), **5 min TTL**, audience-restricted (`aud=opex-partner`), and
  sender-constrained with **DPoP**.
- Refresh tokens: 8 h, rotated on every use with reuse detection (reuse revokes the session family).
- **Revocation:** `/oauth/revoke`; a deny-list in Redis by `jti` and `session_id`.
- **Signing keys:** rotated every 90 days, JWKS with overlap; private keys in an HSM/KMS or Vault
  transit.
- **Scopes**, coarse (fine-grained rights come from grants, §4.3): `content:read`, `content:propose`,
  `media:upload`, `cr:read`, `cr:withdraw`.

### 3.3 Authorization

Every request is checked by layered guards in this order:
1. **Authentication guard:** token valid, not revoked, DPoP proof valid.
2. **Network guard:** partner CIDR and mTLS fingerprint match the token's client.
3. **Scope guard:** the token scope covers the endpoint.
4. **Grant guard (ABAC):** the principal holds a grant whose scope covers the target type, entry,
   field path and locale, and whose action covers the operation (§4.3).
5. **Lock guard:** locked types and fields can't be touched by partners; operators need
   `super_admin` plus step-up.
6. **Policy engine** (CR submissions only, §7.3).

Denies are **default** and **audited** (`authz.denied`). Operators bypass grants (full access) but
never bypass audit, locks (without step-up) or validation.

### 3.4 Request integrity

- **Idempotency:** every mutating partner request carries an `Idempotency-Key` header (UUIDv4). The
  same key with the same body replays the stored response; the same key with a different body returns
  409.
- **Optimistic concurrency:** reads return an `ETag` (the revision `data_hash`); proposals must send
  `If-Match` or `base_revision_id`. A mismatch returns `412 Precondition Failed` with the current
  revision, so AraCMS can rebase.
- **HTTP Message Signatures (RFC 9421)** on partner requests: they cover method, path, content-digest,
  `X-End-User-IP`, `Idempotency-Key` and `created`, using the partner's registered key. Signatures
  older than ±60 s are refused; nonces are replay-cached in Redis for 5 min.
- **Schema validation:** every body is validated by Zod (from `packages/schema`). Unknown fields are
  rejected (`strict`).

### 3.5 Input, content and output safety

- **Rich text** is stored as a **structured AST** (a ProseMirror-like JSON with an allowlist of
  nodes: paragraph, strong, em, link, list), **never raw HTML**.
  - Links allow only `https:`, `mailto:`, `tel:` and relative paths.
  - The site renders the AST to React, so no `dangerouslySetInnerHTML` for content.
- **Plain text fields:**
  - max length per field in the schema;
  - control characters stripped;
  - bidi override characters (U+202A–U+202E, U+2066–U+2069) rejected, to prevent Trojan Source-style
    spoofing in fa/en text;
  - normalised to NFC;
  - Persian: `ي→ی`, `ك→ک` normalisation (configurable per field).
- **URLs:** parsed with WHATWG URL; schemes allowlisted. Internal links are validated against the
  site's route table (§6).
- **JSON-LD / script contexts:** the site keeps escaping `<` in JSON-LD (it already does:
  `.replace(/</g, "\\u003c")`).

### 3.6 Media pipeline

1. **Upload:** a presigned PUT to the `media-quarantine` bucket. Max 25 MB by default.
2. **Checks:**
   - magic-byte sniff; allowlist: jpeg, png, webp, avif, gif (static), pdf, svg (sanitised), ai (as
     `application/pdf` or `postscript`; download-only);
   - extension and declared mime must agree.
3. **Antivirus:** ClamAV scan (`clamd`). Infected files are rejected, an audit event is written and
   operators are alerted.
4. **Images:**
   - re-encoded with `sharp`: strip EXIF / GPS / ICC (convert to sRGB);
   - decompression-bomb guard: max 50 MP;
   - derivatives: WebP + AVIF at the site's `deviceSizes` (480…3840) plus original-format fallback;
   - computed: blurhash, dominant colour, width and height.
5. **SVG:** sanitised with DOMPurify (svg profile) and served with
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`. Logos and seals only.
6. **PDF:**
   - checked with `qpdf --check`; files with JavaScript or embedded files are rejected;
   - served with `Content-Disposition: attachment` for downloads; the preview uses `inline` on a
     sandboxed origin.
7. **Release:** files move to `media-private/clean` and are **copied to `media-public` only when a
   revision that references them is published**. Unpublished uploads are never publicly reachable.
8. **Delivery:** public media goes through the site's domain (`/media/*`, reverse-proxied) or a CDN
   host added to `next.config.ts` `images.remotePatterns`. Long-cache immutable URLs carry the content
   hash: `/media/{sha256-prefix}/{w}.webp`.

### 3.7 Secrets, keys, supply chain

- **Secrets:** in Vault or the cloud secret manager; injected as env at runtime; never in images or
  git. A `.env.example` lists names only.
- **Key rotation:** JWT signing 90 d, webhook HMAC 180 d, DB passwords 180 d, partner client keys on
  demand. All rotations are audited.
- **Supply chain:**
  - `pnpm audit`, Renovate, `osv-scanner` in CI;
  - images built from distroless or `node:22-alpine`, run as non-root, read-only rootfs;
  - SBOM (CycloneDX) per release; images signed with cosign.
- **Static analysis:** CodeQL (or Semgrep OWASP rules) on every PR; gitleaks on every PR.

### 3.8 Abuse controls

- **Rate limits** (Redis token bucket; Delivery limits per IP, Partner/Manage limits per principal
  and per IP):

  | Area | Limit |
  |---|---|
  | Login | 5 / min per IP+account; exponential lockout |
  | Partner API | 120 req / min per user, 600 / min per client |
  | Uploads | 30 / h per user |
  | Delivery | 3000 / min per IP (it's cached anyway) |

- **Anomaly alerts:**
  - many denies;
  - logins from a new country;
  - token reuse;
  - bulk changes (> N items in a CR);
  - activity at unusual hours (configurable).

### 3.9 Privacy

- Store the minimum PII: name, email, IP, user agent.
- IP addresses in audit are kept in full for 1 year (security need), then truncated (/24 for IPv4,
  /48 for IPv6).
- An export / erase procedure for partner users, documented. Audit records are kept, with the
  identity pseudonymised under an operator-approved procedure.

---

## 4. Roles, grants and permissions

### 4.1 Operator roles (OPEX staff, console)

| Role | Can |
|---|---|
| `super_admin` | Everything, including locked types, users, grants, policies, keys, webhooks; step-up required for destructive/security actions |
| `operator` | Edit and publish all unlocked content, review and decide CRs, manage media, view audit |
| `auditor` | Read everything including full audit and exports; cannot change anything |
| `viewer` | Read content and CR queue only |

Four-eyes option: a policy flag requires a **second operator** to publish changes to `global.*`,
`seo.*` and locked types.

### 4.2 Partner roles (inside AraCMS)

Defined by operators per partner, for example `aracms_editor` and `aracms_translator` (locale-scoped)
and `aracms_media`. A role is a named bundle of grants.

### 4.3 Grant model (ABAC)

```jsonc
{
  "subject": { "kind": "partner_role", "id": "aracms_editor" },
  "scope": {
    "types":   ["page.home.*", "page.printing", "collection.insights"],   // glob on type key
    "entries": ["*"],                                                    // or explicit ids/slugs
    "fields":  ["/**"],                                                  // field-path globs
    "exclude": ["/seo/**", "/**/href"],                                  // explicit exclusions win
    "locales": ["fa", "en"]                                              // tr not allowed
  },
  "actions": ["read", "propose", "media.upload"],                        // read | propose | media.upload | cr.withdraw | entry.create | entry.delete
  "expires_at": null
}
```

Rules:
- Deny by default.
- Explicit `exclude` beats `include`.
- Locked types and fields are never grantable to partners.
- `entry.create` / `entry.delete` are needed to add or remove collection items (articles, partner
  logos).
- Grants are evaluated by the `AuthorizationService` (pure function, unit-tested with a decision
  table).
- Every evaluation that denies writes `authz.denied` with the matched rules.

**Read filtering:** partner read endpoints **project** entries, so fields outside the grant are
omitted (not nulled), which keeps AraCMS UIs simple.

---

## 5. Content schema system (`packages/schema`)

### 5.1 Principles

- **The website's components define what is editable.** The schema is TypeScript (Zod) next to the
  shared types, so the site, API and console stay in lockstep.
- A schema change is a code change: PR, review, migration. Runtime schema editing is **not** allowed.
  This is safer, and the design stays protected.

### 5.2 Field kinds (building blocks)

| Kind | Stored as | Notes |
|---|---|---|
| `text` | `{fa,en,tr}` strings | `max`, `multiline`, `required[]` per locale, `persianNormalize` |
| `richText` | `{fa,en,tr}` AST | allowlisted nodes only (§3.5) |
| `lines` | `{fa,en,tr}` string[] | for multi-line headings like `title: ["Multi-Layered","Seamless","Plastic Tube"]` |
| `number` / `integer` | number | min/max/step/unit |
| `boolean`, `enum` | — | `enum` values from code |
| `url` / `link` | `{href, label?}` | internal links validated against routes; external `https` only |
| `image` | `{asset, alt:{fa,en,tr}, focal?:{x,y}, perLocale?:{fa?,en?,tr?}}` | resolved to `Img {src,width,height}`; `perLocale` replaces today's `locale === "fa" ? …` switches (Products, ContactCTA, TrustedPartners, Hero) |
| `artDirected` | `{wide:{ltr,rtl}, tall?:{ltr,rtl}, mobile?}` | for the effervescent posters, product hero `{ltr,rtl}`, hero packaging mobile/rtl |
| `file` | `{asset, label}` | downloads (printing resources, brochure) |
| `list<T>` | array with stable `id` | `min`, `max`, `sortable`, `allowAdd`/`allowRemove` (grant-checked) |
| `group` | object | nesting |
| `ref<Type>` | entry id | for collections (articles, partners, samples) |
| `locked<T>` | any | visible, versioned, editable only by `super_admin` with step-up; never partner-editable |

Each field has:
- `label` and `help` (fa/en);
- `editorial` hints: character budget, tone;
- `ui` hints: textarea, colour, crop ratios matching the component (e.g. hero bg 16:9, card 4:3);
- `preview` binding (the CSS selector on the page, for click-to-edit in preview, P7).

### 5.3 Type registration and versioning

- At boot `opex-api` registers all types: it stores `key`, `version` and `schema_hash`.
- If stored entries were written by an older schema version, a **migration function** declared in code
  (`migrate(fromVersion, data) → data`) runs, creating a new revision authored by
  `system:migration`.
- A breaking change without a migration fails CI (contract test, §11).

### 5.4 Generated artifacts

From `packages/schema` the build generates:
- JSON Schema per type;
- the OpenAPI 3.1 document for the Partner, Manage and Delivery APIs;
- TypeScript types for the site (`ContentOf<'page.printing'>`);
- console form definitions;
- the AraCMS integration reference (§9.6).

---

## 6. Content inventory: what becomes editable

This is the authoritative list. Every text and image the site shows is listed with its new
**content type** and the source it comes from today. "Locked" means visible but not editable in v1
(Three.js and geometry).

Notation: `→ TypeKey`, then the fields. `(L)` means localized fa/en/tr.

### 6.1 Global

**`global.site`** (singleton), today `lib/site.ts`, `lib/i18n/*` (`meta`, `common`, `nav`, `search`,
`footer`, `cta`) and `app/[locale]/layout.tsx`:
- brand name (L);
- default meta title and description (L); default OG image (image), today `/images/og.jpg`;
- **contact:** office (L), address lines (L), phone (display + `tel` href, validated E.164), email
  (validated); used by `Footer`, `ContactCTA`, quote mailtos and JSON-LD;
- **social:** Instagram URL, LinkedIn URL (https, host allowlist);
- **brochure** (file), today `links.brochure` → `/files/arapoush-catalog.pdf`;
- **logos** (image, **locked** by default because of the brand): header `/images/logo.png`, footer
  `/images/logo-white.png`, page loader, 3D tube logo texture;
- **navigation** (list): label (L) + target (internal route or anchor; validated). Today
  `nav.items`, including `/printing`, `/media`, `/about`; the routes that don't exist are flagged in
  the console;
- **header:** quote button label (L), search labels (L), menu aria labels (L);
- **search:** placeholder, empty, hint, group labels (L). The search **index** used by
  `components/layout/SearchPanel.tsx` (products, applications, articles, certificates) must be
  **built from published content** (Delivery `bundle`), not from the dictionaries;
- **footer:** tagline lines (L), section headings (L), product link labels (L), explore link labels
  (L) + targets, office (L), rights text (L), back-to-top (L), footer background (image)
  `/images/footer-bg.webp`;
- **closing CTA** (`cta`): title lines (L), lead (L), button labels (L), background (image)
  `/images/cta-bg.webp`, tube (image, **perLocale**: today `cta-tube.webp`, `fa/cta-tube.webp`);
- **UI microcopy** (`common`, a11y labels): editable but **operator-only** by default (a11y risk).

### 6.2 Home (`/[locale]`)

**`page.home.layout`**, today `content/home-layout.json`: an ordered list of `{id, type, enabled}`,
with type limited to the `sectionRegistry` keys. Operators only; partners need an explicit grant.

**`page.home.hero`**, today `Hero.tsx` visuals and `hero.*` dictionary:
- slides (list, max 6): id, tone (enum light/dark), background (`artDirected`: today
  `hero-packaging-ltr/rtl/mobile`, `hero-bg`, `cta-bg`, `partners-bg`), product image (image,
  optional; today `hero-products`, `cta-tube`), title lines (L), lead (L), product alt (L);
- labels: quote (L), story (L), slideOf (L), goTo/prev/next/play/pause (L);
- rules preserved: the first slide's images are LCP (`priority`); later ones load after idle. The
  schema notes "slide 1 should be < 300 KB".

**`page.home.products`**, today `Products.tsx` visuals and `products.*`:
- eyebrow, title lines, lead, view/enquire labels (L);
- cards (list, fixed 2 in v1): number, title lines (L), text (L), image (image, **perLocale**: today
  `product-tube` / `fa/product-tube`), tone, link (internal route);
- decorative tablets image (image) `/images/tablets.webp`.

**`page.home.applications`**: eyebrow, title, lead (L); items (list): title, text (L), image (today
`app-cosmetics|food|hygienic|pharma.webp`).

**`page.home.insights`** plus **`collection.insights`** (articles):
- **page fields:** eyebrow, title, lead, labels (L); "view all" link;
- **each article:** category (L), tag (enum), title (L), excerpt (L), image (today
  `journal-1..3.webp`), link (optional), published date.

**`page.home.partners`**: eyebrow, title, lead lines (L), background (image, **perLocale**: today
`partners-bg` / `fa/partners-bg`), logos (list of `collection.partner`: name, logo image (svg/png,
`data-no-mirror`), width hint, link).

**`page.home.certifications`**: eyebrow, title, lead (L), background (`cert-bg`), items (list): code
(GMP / ISO 9001 / IFDA / INSO), name (L), text (L), seal image (`cert-*.webp`).

### 6.3 Multi-layer tube (`/[locale]/products/multi-layer-tube`)

**`product.tube.page`**, today `productTube.*` (except the configurator) and
`content/products/multi-layer-tube.json` `images`:
- meta title and description (L), breadcrumb, eyebrow, title lines, lead, quote and video labels,
  features (L lines);
- hero image (`artDirected` `{ltr, rtl}`); layers section copy and image `{ltr, rtl}`;
- configurator **texts** (L): titles, labels, units, disclaimer, quote form labels and messages.

**`product.tube.catalogue`** (Three.js-driven), today the rest of `multi-layer-tube.json`:
- **Locked in v1:** shapes, diameters, lengths, volumes, closure compatibility, 3D `model` keys,
  structures and their layer ordering.
- **Editable texts and images inside it:** shape / closure / structure / layer **names and
  descriptions** (L), shape and closure card images, and **samples** (list: title (L), image,
  tags). The editor shows locked numbers greyed out.

### 6.4 Effervescent tube (`/[locale]/products/effervescent-tube`)

**`product.effervescent.page`**, today `productEff.*` and `effervescent-tube.json`:
- meta (L), eyebrow, title lines, lead, quote/sizes labels, drag/viewer/scatter/drop/tap hints (L),
  story steps (list of title + text (L));
- sizes section copy (L), including the quote sheet form labels and messages;
- **caps section:** title, lead, label, partsLabel, `parts.*` title + text (L), `variants.*` heading,
  text, points (L), benefits (list, L), alt (L); background (image) `caps-bg`; per variant: name (L),
  **photo** (image) `cap-*-photo` — editable;
- **uses section:** eyebrow, title, lead, items (L), photoAlt, alt (L); photo `uses-products`,
  background `uses-bg` (images);
- **manufacturing section:** title, lead, labels (L); stats `dailyCapacity` (integer), `since` (L);
  seals (images) and alt (L);
- studio backdrop (image, optional) `images.studio`;
- **posters** (`artDirected` `hero-tube-{wide,tall}-{ltr,rtl}`): **locked**, because they are 3D
  renders.

**Locked in v1:**
- `sizes[]` (`d`, `h`, `render.*`), `renderPxPerMm`, `defaultSize`;
- cap `variants[].parts[]` x/y (marker positions measured on the photo);
- cap `image` renders, `uses-tablets`, size renders.

**Warning in the console:** replacing a cap photo invalidates the measured part positions. The
console shows a "positions need re-measuring" flag and keeps the old positions, which only operators
can edit (a numeric x/y editor with a live overlay preview, P7).

### 6.5 Printing (`/[locale]/printing`)

**`page.printing`**, today all of `content/printing.json` and the hard-coded images in
`components/printing/*`:
- meta (L);
- hero: eyebrow, title, lead, CTA labels, tubes alt (L), features (list: icon (enum from
  `PrintIcons`) + text (L)), images `bg-light`, `tube-colour`, `tube-gold`;
- tech: labels (L); items (list of 5, ids fixed; no add or remove in v1, because the guide logic
  references them): name, short, summary, advantages[], process, capabilities[], uses (L); card
  image, macro image; sample ref;
- guide: texts (L), steps (L); **questions and options**: labels (L) editable; the scoring
  (`effects`, `excludes`, `asks`, scores `s`) is **operator-only** (logic, not copy);
- samples: texts (L), items (list): title, industry, text (L), image, method (enum TechId);
- downloads: texts (L), items: name, text (L), format (enum), **file** (`file` field: when set and
  clean, Download and Preview appear automatically with the real size; the existing behaviour in
  `getPrinting()` moves to the delivery mapper);
- compare: texts (L), columns (L), rows (L, null = "not stated");
- CTA: texts (L), tube image `cta-tube`;
- section backgrounds: `bg-navy`, `layers` (images).

### 6.5.1 About (`/[locale]/about`)

**`page.about`**, from `content/about.json` (Persian copy quoted from arapoush.com; certificate facts
read from the documents). Every section has a **`style`** enum that switches its component variant:
- meta (L);
- hero (`style`: `cinema` | `split`): eyebrow, title, lead, slogan, CTA and video labels (L), stats
  (list: value, label (L)), video (`file` fields `mp4`, `webm` under `/files/video/`), poster image
  `images.poster` (the LCP; the film loads on idle or intent);
- story (`style`: `pinned` | `vertical`): texts (L), milestones (list: year, title, text (L), image),
  today (title, figure, unit, achievements[] (L));
- gallery (`style`: `filmstrip` | `mosaic`): texts (L), items (list: image, caption (L));
- honours (`style`: `wall` | `list`): texts and labels (L), items (list: kind (enum `certificate` |
  `licence` | `award`), title, year (L or null when the document shows none), issuer, scope, text (L),
  image, copies (images)).

### 6.5.2 Contact (`/[locale]/contact`)

**`page.contact`**, from `content/contact.json`. It merges eight arapoush.com pages into one: contact,
sales department, laboratory, quality control, recruitment, FAQ, suggestions and complaints. Facts
(numbers, extensions, people, addresses) are quoted from those pages. Sections:
- meta (L);
- hero (`style`: `split` | `banner`): kicker, title, lead, button labels (L), call-now number, building
  photo `images.hero` (the LCP);
- directory (`style`: `tabs` | `grid`): texts and labels (L); departments (list: id, icon (enum), name,
  summary (L), phones[], email, hours[] (L, hidden when empty), people (list: name, role (L), exts[],
  mobiles[])). Operators can add departments and people;
- locations (`style`: `split` | `stacked`): texts and labels (L); places (list: name, address (L),
  `query` (address text for map search), postal code, phones[], fax, telegram, `geo` (lat, lng numbers),
  `maps` (google, neshan, balad URLs)). With `geo` set, all three map apps open at the point. A pasted
  map link overrides the generated one. Without either, only Google Maps is offered, as an address
  search. Place photos are in `images.places` (by id);
- request, careers (openings list), feedback (two tabs, each naming an OPEX form slug, operator-only),
  faq (groups of question and answer (L), plus an aside card).

Forms on the page are OPEX forms: `request`, `careers`, `feedback` and `complaint`. They are seeded as
system forms, like `quote` and `contact`. Their definitions live in `packages/schema/src/systemForms.ts`,
so the site renders them even when OPEX is off.

### 6.5.3 Tube catalogue v3 and the size-chart import

**`product.tube.catalogue`** (v3) holds:
- shapes: `sizes`, a map from diameter to rows of length and volume;
- closures:
  - `compat`, a map from shape to diameter to `chart` or `confirm`;
  - `colours`, a map from shape to diameter to colour ids;
  - `aliases`, the chart wordings;
  - `shoulder`, for eye-nozzle caps;
- `colourFamilies`;
- structures, optionally limited by `diameters` or `closures`.

`map` fields take their keys from the data (`packages/schema/src/fields.ts`). A chart can therefore
add a diameter, shape or closure without a schema change.

The size charts (`.xlsx`) are applied in three ways:
- in the console: **Catalogue** (`/catalogue`): preview, warnings, a change list, then save as a draft;
- through `POST /v1/manage/catalogue/tube/import`;
- for the repository seed: `pnpm --filter @arapoush/opex-api tube:chart`.

How the import works:
- The parser is `packages/schema/src/tubeChart.ts` and the reader `apps/opex-api/src/catalogue/xlsx.ts`.
- Unknown wording becomes a new closure, with a warning.
- A colour listed twice is flagged as a likely chart typo.
- Diameters a chart does not mention are kept unless "keep missing" is off.
- A pre-v3 draft is upgraded on its first import.

### 6.6 SEO and machine-readable output (derived, not separately edited)

- **Per page `seo` group** (in each page type): title, description (L), OG image, `noindex` boolean
  (operator-only).
- **JSON-LD** (`lib/seo.ts`), **sitemap** (`app/sitemap.ts`) and **llms** (`llmsText`) are
  **generated from published content**. Their image lists come from the entries' image fields
  instead of the hard-coded arrays in `app/sitemap.ts` and `lib/seo.ts` `productImages`.

### 6.7 Explicitly not editable (code-owned)

- CSS, layout and motion: GSAP, `Reveals`, `Drift`, parallax amounts.
- Three.js: `EffScene.ts`, `EffGlass.ts`, `EffEnvironment.ts`, `EffParts.ts` (geometry, materials,
  the tube sleeve print texture including the ARAPOUSH wordmark, tablet deboss), `TubeScene.ts`.
- `scripts/render-effervescent.cjs` (still run manually by our team in v1).
- Route structure and the locale list.

---

## 7. Change requests, approval and publishing

### 7.1 Who edits how

- **Operators (console):**
  - edit drafts directly; every save is a revision;
  - publish manually or on a schedule;
  - may still open a CR for four-eyes review.
- **AraCMS (partner API):**
  - **never writes drafts directly**; it submits CRs;
  - a CR is evaluated by the policy engine on submit.

### 7.2 CR state machine

```
           submit                 policy=auto_approve           publish (auto or by operator)
 draft ───────────► submitted ─────────────────────► approved ───────────────────────► published
   │                    │ policy=require_review          ▲  │ base changed (conflict)
   │                    ▼                                │  ▼
   │               pending_review ── approve ────────────┘ needs_rebase ── resubmit ──► submitted
   │                    │ reject ───────► rejected
   │ withdraw (author)  │ withdraw ─────► withdrawn
   └────────────────────┴──────────── expire (30 d idle) ► expired
 superseded: when an operator edits the same field and publishes first, open CRs touching that field → needs_rebase
```

- Transitions are enforced in one `ChangeRequestService`, with row-level locks
  (`SELECT … FOR UPDATE`).
- Every transition writes an audit event and notifies AraCMS via webhook (§9.5).
- **Approve** applies the CR's items onto the **current draft** (three-way merge per field path):
  - if the field's current value still equals `old_value`, it applies cleanly;
  - otherwise the CR moves to `needs_rebase`, with the conflicting paths listed.
- Approval creates a revision with `via_cr_id`. **Publish** promotes it.
- An operator can **partially approve**: accept some items, reject others, with a reason per item.
- An operator can **edit before approving**. That is recorded as an operator amendment: separate
  items, separately audited.

### 7.3 Approval policies (operator-configured)

The policy engine is a pure function: `evaluate(cr, principal, policies[]) → {effect, matched[],
reasons[]}`. Policies are ordered by priority; the first decisive match wins; the default is
`require_review`. A policy example:

```jsonc
{
  "name": "Typos in article excerpts auto-approve",
  "priority": 100,
  "scope": { "partners": ["aracms"], "types": ["collection.insights"], "fields": ["/excerpt", "/title"], "locales": ["fa","en","tr"] },
  "conditions": {
    "maxItems": 5,
    "textEditDistanceRatio": { "lte": 0.2 },     // small edits only
    "noNewAssets": true,
    "noLinks": true,
    "principalRoles": ["aracms_editor"],
    "timeWindow": { "tz": "Asia/Tehran", "days": ["sat","sun","mon","tue","wed"], "from": "08:00", "to": "18:00" }
  },
  "effect": "auto_approve",
  "autoPublish": true
}
```

**Supported conditions:**
- `maxItems`;
- `textEditDistanceRatio` (normalised Levenshtein);
- `maxLengthDelta`;
- `noNewAssets` / `assetsOnly`;
- `noLinks` (no URL or link changes);
- `locales`;
- `principalRoles` / `principals`;
- `timeWindow`;
- `entryCreate` / `entryDelete` allowed;
- `requiresSecondApprover` (four-eyes);
- `cooldown` (max N auto-approvals per hour per user).

**Hard rules** (cannot be overridden by policies):
- Locked fields: denied.
- Link and URL changes on `global.*`: review.
- New media: always scanned first. Auto-approval waits for the scan to finish clean.
- Bulk CRs (more than 50 items): review.
- Every auto-approval is audited with the matching policy id and inputs.

**Policy simulator in the console:** "would this CR auto-approve?", using the same engine. This is
required before saving a policy.

### 7.4 Publishing

- **Publish** sets `published_revision_id`, copies the referenced assets to `media-public`, writes
  `publication` and audit records, then enqueues `content.published` webhooks to the website (§10)
  and AraCMS.
- **Scheduled publish:** `scheduled_at` on the entry or CR; executed by a worker; idempotent.
- **Rollback:** publish any earlier revision (one click in the console, step-up for `global.*`).
  Audited as `trigger=rollback`.
- **Preview:** any draft or CR has a signed, expiring preview URL (§10.3).

---

## 8. Audit logging (tamper-evident)

### 8.1 What is logged (minimum set)

| Category | Events |
|---|---|
| Auth | login success/failure, MFA challenge/result, logout, session revoke, token issue/refresh/reuse-detected, password/MFA change, lockout |
| Identity admin | principal create/disable, role change, partner client create/key rotate, grant create/update/delete |
| Policy | policy create/update/delete/simulate |
| Content | revision create (with JSON Patch diff), entry create/delete, lock/unlock, schema migration |
| CR | submit, policy decision (with matched policy + inputs), approve/partial/reject/withdraw/expire/rebase, operator amendment |
| Publish | publish, schedule, rollback, webhook delivery result |
| Media | upload, scan result, reject, variant generation, delete, public release |
| Access | every partner API read of non-public data (sampled detail, full counts), every `authz.denied`, export of data or audit |
| System | config change, key rotation, backup/restore, deployment version change |

### 8.2 Record shape

```jsonc
{
  "id": "01J…", "seq": 18233, "ts": "2026-11-11T09:41:22.381Z",
  "tenant": "arapoush",
  "action": "cr.approve",
  "result": "success",                       // success | failure | denied
  "actor": {
    "kind": "operator",                      // operator | partner_user | service | system
    "id": "01H…", "display": "Sara M.",
    "roles": ["operator"],
    "via_client": null,                      // e.g. "aracms" for partner calls
    "session_id": "…", "auth": { "method": "webauthn", "mfa": true, "step_up": true }
  },
  "request": {
    "id": "req_…",                           // = OpenTelemetry trace id
    "ip": "203.0.113.8",                     // as seen by OPEX (after trusted-proxy parsing)
    "asserted_end_user_ip": "198.51.100.4",  // partner-signed header, if any
    "user_agent": "…", "method": "POST", "path": "/v1/manage/change-requests/01J…/approve",
    "geo": { "country": "IR" }               // from local GeoIP DB, optional
  },
  "resource": { "type": "change_request", "id": "01J…", "entry": "page.printing", "fields": ["/tech/items[id=flexo]/summary@fa"] },
  "changes": [ { "op": "replace", "path": "/tech/items[id=flexo]/summary@fa", "old": "…", "new": "…" } ],
  "reason": "Approved: matches brief",
  "prev_hash": "base64…", "hash": "base64…"   // SHA-256(prev_hash || canonical_json(record_without_hash))
}
```

### 8.3 Integrity

- **Same transaction:** the audit row is written **in the same DB transaction** as the change. If the
  audit insert fails, the change fails.
- **Append-only:**
  - the `audit_events` table is owned by a separate DB role;
  - the app role has `INSERT` + `SELECT` only;
  - a trigger raises on `UPDATE` / `DELETE` / `TRUNCATE`.
- **Hash chain:** a `seq` + `prev_hash` chain per tenant. A nightly job verifies the chain and alerts
  on breaks.
- **Off-site anchoring:** every hour the latest `hash` + `seq` is exported to **WORM storage**
  (S3 Object Lock, compliance mode, 1 year), and optionally signed with the KMS key. A full daily
  export (JSONL, gzip) goes to the same WORM bucket.
- **Time:** NTP-synced; ts from the DB (`clock_timestamp()`), not the app.
- **IP correctness:** only trust `X-Forwarded-For` from the configured proxy CIDRs (Fastify
  `trustProxy` list). Store the raw chain too, for forensics.

### 8.4 Operational logs (separate from audit)

- Structured JSON (pino) with `trace_id`, `span_id`, `principal_id`, no secrets or tokens (redaction
  list), and no full bodies (sizes and hashes only).
- Shipped to Loki. Retention: 30 days hot, 1 year cold.
- Metrics:
  - request rate / latency / error per route;
  - CR queue size and age;
  - publish duration;
  - webhook failures;
  - scan backlog;
  - auth failures.
- **Alerts** (Alertmanager → email + Telegram/Slack):
  - audit chain break;
  - more than 10 denies / 5 min per principal;
  - token reuse;
  - an infected upload;
  - webhook to the site failing > 15 min;
  - DB replication lag;
  - backup failure;
  - certificate expiry < 14 d.

### 8.5 Audit UI (console)

- **Filters:** actor, client, IP, action, resource, field path, time range, result.
- **Views:** per entry "history" (revisions + diffs side by side, per locale, RTL-aware) and per CR
  timeline.
- **Export:** CSV / JSONL, step-up required; the export itself is audited.
- **"Verify chain"** button, which runs the verifier on a range and shows the result.

---

## 9. APIs

All three surfaces are generated into one OpenAPI 3.1 file, plus a separate public doc for the
Partner API.

### 9.1 Conventions

- **Versioning:** `/v1/…`. Breaking changes need `/v2`; additive changes are fine.
- **Format:** JSON; `application/problem+json` (RFC 9457) for errors with a stable `code`. Example
  codes: `CONFLICT_BASE_REVISION`, `FIELD_LOCKED`, `GRANT_DENIED`, `VALIDATION_FAILED`.
- **Pagination:** cursor (`?cursor=…&limit=…`, max 100).
- **Headers:**
  - every response carries `X-Request-Id`;
  - mutating calls need `Idempotency-Key`;
  - concurrency uses `ETag` / `If-Match`.
- **Locales:** `?locale=fa` projects the localized fields, or `?locale=*` returns all three.

### 9.2 Delivery API (website, read-only, published only)

```
GET /v1/delivery/content/{typeKey}?locale=*            → published entry (singleton) or list (collection)
GET /v1/delivery/content/{typeKey}/{slug}?locale=*
GET /v1/delivery/bundle?types=page.home.*,global.site  → many entries in one call (build-time)
GET /v1/delivery/routes                                → sitemap source: routes × locales × lastmod × images
```

- **Auth:** a static **delivery token** (read-only, bearer, rotatable) from the site's server only;
  never exposed to browsers.
- **Responses:** the resolved shape the site already uses. Images come as `{src, width, height,
  alt, blurhash}`, with `src` an absolute media URL.
- **Caching:** `Cache-Control: s-maxage=60, stale-while-revalidate=86400`, plus ETags.

### 9.3 Partner API (AraCMS)

```
GET    /v1/partner/me                                   → principal, partner, effective grants (for building AraCMS UI)
GET    /v1/partner/schema                               → JSON Schema of types/fields the caller may see, with labels, limits, locks
GET    /v1/partner/content/{typeKey}[/{entryId}]        → current **draft** projected to granted fields + ETag + base_revision_id
GET    /v1/partner/content/{typeKey}/{entryId}/history  → revisions (granted fields only)
POST   /v1/partner/media/uploads                        → presigned upload (returns upload id + URL + required headers)
POST   /v1/partner/media/uploads/{id}/complete          → triggers scan/processing; returns asset id (status quarantine)
GET    /v1/partner/media/{assetId}                      → status, variants (when clean)
POST   /v1/partner/change-requests                      → create (items[], base_revision_ids, title, note); returns state + policy decision
GET    /v1/partner/change-requests?state=…              → list own CRs (or all partner CRs with cr:read_all grant)
GET    /v1/partner/change-requests/{id}                 → detail incl. per-item decision and reasons
POST   /v1/partner/change-requests/{id}/withdraw
POST   /v1/partner/change-requests/{id}/resubmit        → after needs_rebase, with new base ids
POST   /v1/partner/previews                             → signed preview URL for an open CR (expires 30 min)
```

Change request body:

```jsonc
POST /v1/partner/change-requests
Idempotency-Key: 6f1c…
Signature-Input / Signature / Content-Digest: …   (RFC 9421)
{
  "title": "Update flexo summary",
  "note": "Per sales team",
  "items": [
    { "entry": "page.printing", "base_revision_id": "rev_…", "path": "/tech/items[id=flexo]/summary", "locale": "fa", "op": "set", "value": "…" },
    { "entry": "page.printing", "base_revision_id": "rev_…", "path": "/hero/images/tubeColour", "op": "set", "value": { "asset": "ast_…", "alt": { "fa": "…" } } }
  ]
}
→ 201 { "id": "cr_…", "state": "pending_review" | "approved" | "published", "decision": { "effect": "...", "policy": "pol_…", "reasons": [...] } }
```

### 9.4 Management API (console only)

Full CRUD, behind operator auth:
- entries, revisions, publish, rollback, schedule;
- CRs (decide, partial, amend);
- media;
- principals, partners, grants, roles, policies (+ simulate);
- webhooks;
- audit (query, export, verify);
- system (keys, health).

### 9.5 Webhooks (outbound)

- **Events:**
  - `cr.state_changed`, `cr.comment` (to AraCMS);
  - `content.published` and `content.unpublished` (to the website and AraCMS);
  - `media.scan_completed`.
- **Signature:** `OPEX-Signature: t=…, v1=HMAC_SHA256(secret, t + "." + body)`. Receivers reject skew
  over 5 min and replays (event id).
- **Delivery:** at-least-once, retries with exponential backoff (1 m … 6 h, 24 attempts), then a dead
  letter. Visible in the console.

### 9.6 AraCMS integration package (we deliver; they build their UI)

- `docs/opex/aracms-integration.md`:
  - the auth flow (Authorization Code + PKCE, `private_key_jwt`, DPoP, mTLS) with sequence diagrams;
  - request signing;
  - the CR lifecycle and webhook handling;
  - error codes;
  - a sandbox.
- `/clients/php-reference`, a minimal PHP 8.3 library (Guzzle + `web-token/jwt-framework`) that:
  - logs a user in;
  - lists granted content;
  - uploads media;
  - submits a CR;
  - verifies webhooks.

  CI runs its tests against a sandbox OPEX.
- **Sandbox tenant** `arapoush-sandbox` with fake content, so AraCMS can integrate without touching
  production.

---

## 10. Website changes (`apps/web`)

The site keeps static generation and performance. Content moves from files to the Delivery API
**behind the existing loader functions**, so components change minimally.

### 10.1 Content access layer (`apps/web/lib/content/`)

- `getContent<T>(typeKey, opts)` uses `@opex/sdk-ts`, server-only.
  - **Cache:** Next `fetch` with `next: { tags: [typeKey, entryId], revalidate: false }`.
  - **Fallback:**
    - if OPEX is unreachable at build or revalidation, read the last good **snapshot**
      (`apps/web/content-snapshot/*.json`, refreshed by CI from Delivery);
    - the build never fails because OPEX is briefly down; the snapshot is also today's JSON
      (migration seed).
- **Rewrite the loaders to use it, same return types:**
  - `getTubeProduct()`, `getEffervescentProduct()`, `getPrinting()`;
  - the home layout loader in `lib/sections.tsx`;
  - `getDictionary()`, which becomes **server-assembled**: static UI microcopy from code, merged with
    content-driven strings from the page and global types.
- **Image resolution:** `Img` from content. `next.config.ts` `images.remotePatterns` adds the media
  host (or `/media/:path*` is proxied same-origin, preferred, keeping CSP simple and cookies off
  media).
- **Remove every hard-coded image path** listed in §6:
  - `Hero.tsx`, `Products.tsx`, `Applications.tsx`, `Insights.tsx`, `TrustedPartners.tsx`,
    `Certifications.tsx`, `ContactCTA.tsx`, `Footer.tsx`, `Header.tsx`, `EffSections.tsx`,
    `PrintHero.tsx`, `PrintSections.tsx`, `SelectionGuide.tsx`;
  - `app/sitemap.ts`, `lib/seo.ts`, `app/[locale]/layout.tsx`;
  - **`perLocale` image fields** replace the `locale === "fa" ? "/images/fa/…" : …` switches.
- **Keep:**
  - `data-no-mirror` on all content images;
  - `priority` / `fetchPriority` only on slide 1 and the page LCP image;
  - real `sizes` attributes;
  - `next/image` everywhere.

### 10.2 Revalidation

- `POST /api/opex/revalidate` receives `content.published`:
  1. verify the HMAC + timestamp + event id (replay cache);
  2. call `revalidateTag(typeKey)` and `revalidateTag(entryId)`;
  3. respond 204 within 2 s.
- **Route set:** `/[locale]` pages listing which types they use, so `global.site` changes revalidate
  all pages.
- **Sitemap, llms, JSON-LD:** derived from the same cached content, so they revalidate with it.
- **Safety net:** a full revalidation on deploy, and a nightly `revalidateTag('all')`.

### 10.3 Preview

- `GET /api/opex/preview?token=…` checks a signed, short-lived token (issued by OPEX for a draft or
  CR), enables Next `draftMode()` and redirects to the page.
- Draft fetches use the **Preview API** with the token. Preview pages send
  `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
- The console embeds preview in an iframe at phone, tablet and desktop widths, in fa and en (the
  responsive checks the team already does manually).

### 10.4 Forms (optional in v1, recommended)

- Quote and contact (`QuoteSheet`, configurator `QuoteForm`, `quoteMailto` users) post to OPEX
  `POST /v1/delivery/forms/{form}`.
- **Protections:**
  - honeypot;
  - per-IP rate limit;
  - optional Cloudflare Turnstile / hCaptcha;
  - schema validation reusing `validateQuote` rules from `lib/configurator/quote.ts`.
- **Delivery:** stored as **inquiries** (PII; encrypted at rest; 2-year retention), emailed to
  `sales@`, visible to operators (and to AraCMS with an `inquiries:read` grant).
- **Fallback:** `mailto:` stays when JS is off or OPEX is down.

### 10.5 Non-regression rules (from `CLAUDE.md`, still binding)

- `npx next build` passes.
- Lighthouse A11y / BP / SEO = 100 on fa and en, mobile and desktop; performance not lower than
  before.
- **SEO surface stays complete:**
  - `generateMetadata` (title, description, canonical, hreflang + x-default, OG, Twitter, robots);
  - JSON-LD (now content-fed);
  - sitemap (every route × locale, plus content images);
  - robots allows AI crawlers;
  - llms / llms-full.
- **Content validation protects a11y** (the schema enforces):
  - required alt text on meaningful images;
  - max lengths, so headings don't overflow buttons (e.g. button labels ≤ 32 chars, enforced in
    the schema).

---

## 11. Quality, testing and CI

- **Unit:**
  - `AuthorizationService` (decision table);
  - the policy engine (property-based tests: fast-check);
  - field-path parser;
  - three-way merge;
  - audit hash chain;
  - sanitisers (bidi, NFC, Persian normalisation);
  - media sniffing.
- **Integration:** Testcontainers (Postgres, Redis, MinIO, ClamAV). Full CR lifecycle, conflict and
  rebase, auto-approve paths, publish → webhook → site revalidation.
- **Contract:**
  - generated OpenAPI is diffed against the last release;
  - breaking changes fail without a version bump;
  - the PHP reference client test suite runs against a sandbox build.
- **Security:**
  - ZAP baseline scan on staging per release;
  - authz tests that every Partner endpoint denies without a grant (generated from routes);
  - dependency and secret scanning (§3.7).
- **E2E:** Playwright.
  - Operator: login with TOTP, edit, preview, publish.
  - Partner flow via the PHP reference client: propose, approve, see it live.
  - Site: the page shows the new text in fa and en, at 390 / 768 / 1440.
- **Performance:**
  - Lighthouse CI on `/fa`, `/en`, `/fa/printing`, `/fa/products/effervescent-tube`,
    `/fa/products/multi-layer-tube`, with budgets from §10.5;
  - k6 load test on the Delivery API (p95 < 150 ms uncached, < 20 ms cached).
- **Definition of done per PR:** tests green, OpenAPI regenerated, migration included, audit events
  for every new mutation, docs updated.

---

## 12. Operations

- **Environments:** `dev`, `staging` (sandbox tenant for AraCMS), `prod`. Prod data is never copied
  to lower environments without anonymisation.
- **Deploy:**
  - Docker images per app;
  - `infra/docker-compose.prod.yml` for a single host (Caddy, web, opex-api, opex-worker,
    opex-console, Postgres, Redis, MinIO, ClamAV, Loki/Prometheus/Grafana); Helm chart later;
  - `install.sh` and the updater (existing update + rollback) gain the OPEX services, run DB
    migrations (expand → migrate → contract), and **back up before every update**.
- **Backups:**
  - Postgres: WAL archiving + daily base backup (PITR 14 days);
  - object storage: versioning plus a nightly replica to a second location;
  - restore drill monthly, documented in `docs/opex/runbooks/restore.md`;
  - RPO 15 min, RTO 4 h.
- **HA (v2):** Postgres streaming replica, two API instances, Redis Sentinel.
- **Runbooks:**
  - partner key compromise (revoke client, rotate, review audit);
  - operator account compromise;
  - audit chain break;
  - restore;
  - certificate rotation;
  - site revalidation failure.

---

## 13. Delivery phases

Each phase ends deployable. Acceptance criteria are binding.

| Phase | Scope | Acceptance |
|---|---|---|
| **P0 Monorepo** | Move the site to `apps/web`; pnpm + Turborepo; shared tsconfig/eslint; CI pipeline (build, lint, typecheck, test, Lighthouse CI on current site); `install.sh`/Dockerfile updated for the new path | Site builds and deploys exactly as before; Lighthouse scores unchanged |
| **P1 Foundations** | `packages/schema` with field kinds and the first types (`global.site`); `opex-api` skeleton (NestJS/Fastify, config, health, OpenTelemetry, pino, problem+json); Postgres + Drizzle migrations; audit module with hash chain + immutability trigger + verifier; ASVS matrix doc | Writing any row writes an audit event in the same tx; chain verifier passes; UPDATE on audit fails |
| **P2 Identity** | OIDC provider; operators with WebAuthn/TOTP; sessions, revocation, step-up; partner clients (`private_key_jwt`, mTLS fingerprint, CIDR), partner users (Auth Code + PKCE, DPoP); rate limits; security event audit | Pen-test checklist for auth passes; token reuse revokes the family; all auth events in audit |
| **P3 Content core** | Entries, revisions, field paths, validation, sanitisers, locks; media pipeline (presign, sniff, ClamAV, sharp variants, private/public buckets); Management API; Delivery API + delivery token | Can create every §6 type via API with seed data; unpublished media is unreachable publicly |
| **P4 Console v1** | Next.js console: login/MFA, schema-driven editor (all field kinds, RTL/LTR per locale side by side, image crop/focal, per-locale images), revisions + diff, publish/schedule/rollback, media library, audit viewer | Operators can edit and publish every §6 field; history shows who/what/when/IP |
| **P5 Site integration** | `lib/content` + snapshot fallback; rewrite loaders; remove hard-coded images (§10.1); revalidation webhook; preview; SEO/sitemap/llms from content; migration script that seeds OPEX from today's dictionaries + JSON + `public/images` | Site renders identically from OPEX (visual diff on 5 key pages × fa/en × 390/768/1440 < 0.5%); Lighthouse unchanged; editing in console updates the live page in < 10 s |
| **P6 Partner API + CRs** | Grants, projection, CR state machine, three-way merge, needs_rebase, policies + simulator, auto-approve/auto-publish, partner webhooks, Partner OpenAPI + docs, sandbox tenant, PHP reference client | Full lifecycle passes E2E via PHP client; auto-approve only fires on matching policies; every decision audited with policy id |
| **P7 Operator UX** | CR review queue (diffs per locale, partial approve, amend), notifications, policy simulator UI, cap part-position editor with overlay, preview at 3 widths in console | Operator can review a 20-item CR in under 2 minutes; positions editable with live overlay |
| **P8 Forms (optional)** | Inquiries via OPEX; encrypted storage; email; site forms post with mailto fallback | Submissions stored, emailed, audited; spam controls effective |
| **P9 Hardening & go-live** | ZAP + external pen test, load test, backup/restore drill, alerting, runbooks, WORM export, key rotation drills; AraCMS goes live on prod with initial grants | All §11/§12 checks green; sign-off |
| **P10 (later) 3D content** | Render pipeline job (port of `scripts/render-effervescent.cjs` to a worker with headless Chromium) so sizes/caps become editable; poster regeneration; operator-only | Changing a size re-renders line-up, cap and poster images and marks automatically |

---

## 14. Migration specifics (P5)

- **Seed script** (`apps/opex-api/scripts/seed-from-site.ts`):
  - reads `lib/i18n/dictionaries/{fa,en,tr}.ts` (import the TS modules), `content/*.json` and
    `content/products/*.json`;
  - maps them to §6 types;
  - uploads every referenced `public/images/**` file through the media pipeline (dedup by sha256);
  - creates revision 1 authored by `system:migration`;
  - publishes.
- **Ids:** stable ids for list items come from existing ids (`flexo`, `spiral`, …) or slugified
  English titles.
- **Verification step:**
  - render the site from OPEX and from files, and compare the HTML text content per page and locale;
  - zero diffs except whitespace.
- After cut-over, dictionaries keep **UI microcopy only**, and the content JSON files become the
  **snapshot** directory.

---

## 15. Open decisions (defaults chosen; change before P1 if needed)

1. **Hosting:** same server as the site (compose) or separate. Default: **same host,
   separate containers**; split later.
2. **Object storage:** MinIO on the server (default) or a managed S3.
3. **AraCMS user identity:** OPEX-hosted login with Auth Code + PKCE (default, strongest "who"). The
   weaker alternative is AraCMS-asserted identity in signed headers, which is not recommended.
4. **Four-eyes** on `global.*` and SEO publishes: on by default.
5. **Forms (P8)** in v1 or later.
6. **Retention:** audit 7 years (default for change accountability), operational logs 1 year,
   inquiries 2 years.

---

## 16. Glossary

- **OPEX:** our core: content, identity, permissions, approvals, audit, publishing.
- **AraCMS:** the client's PHP panel; an API consumer only.
- **CR:** a change request.
- **Grant:** permission on a scope (types / entries / fields / locales).
- **Policy:** a rule deciding auto-approve versus review.
- **Locked:** visible and versioned, but not partner-editable (3D and geometry in v1).
- **Delivery API:** read-only, published content for the website.
