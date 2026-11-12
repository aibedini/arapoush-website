# API conventions

These rules hold for every OPEX route. The partner-facing guide with the full sign-in and signing walkthrough is
[docs/opex/aracms-integration.md](../../opex/aracms-integration.md). Route-by-route details are in the generated references
(`/docs/partner` publicly; `/v1/manage/docs` in the console).

## Base URLs and versions

| Environment | OPEX API | Website |
|---|---|---|
| Production | `https://opex.arapoush.com` | `https://arapoush.com` |
| Local development | `http://localhost:4000` | `http://localhost:3210` |

- Routes are versioned in the path (`/v1/…`).
- The documents carry `info.version`, the `API_VERSION` in `apps/opex-api/src/openapi/specs.ts`.
- Within `/v1`, changes are additive: new routes, new optional inputs, new response fields.
- A breaking change needs a major or minor version bump and an explicit approval in the commit
  (`API-Break: approved <reason>`).
- `pnpm docs:breaking` fails without both.
- The AraCMS team hears about partner-facing breaks before they ship.

**Clients must ignore unknown response fields.** Request bodies are strict: an unknown field is a
`VALIDATION_FAILED` error, so typos never pass silently.

## Authentication

| Caller | How | Notes |
|---|---|---|
| OPEX console | `opex_session` cookie (HttpOnly, SameSite=Strict) plus `X-CSRF-Token` on writes | Session from password and authenticator. Idle timeout 15 minutes, absolute 8 hours. Sensitive actions need a step-up within the last 5 minutes. |
| AraCMS | `Authorization: DPoP <access token>` plus a `DPoP` proof per request | OAuth 2.1, private_key_jwt. Writes also need `Idempotency-Key` and an RFC 9421 signature. |
| Website server | `Authorization: Bearer <DELIVERY_TOKEN>` | Server to server only. |
| 3D renderer | `Authorization: Bearer <RENDER_TOKEN>` | |
| Prometheus | `Authorization: Bearer <METRICS_TOKEN>` | |

Console roles: viewer < auditor < operator < super_admin. Auditors read everything an operator reads,
plus the audit log, but never write.

## Errors

- Every error is `application/problem+json`:
  ```json
  { "title": "CR_STATE", "status": 409, "code": "CR_STATE", "detail": "Change request is published", "instance": "req_01JD…" }
  ```
- Match on `code` (stable), never on `detail` (for people).
- `instance` is the request id, also sent in the `X-Request-Id` header; quote it when you report a
  problem.
- Validation errors add `issues: [{ "path": "/items/0/path", "message": "…" }]`.
- Every code, with what it means and which routes return it, is in [errors.md](../errors.md).
- The OAuth token endpoint is the exception: it answers with RFC 6749 `{ "error", "error_description" }`.

## Rate limits

- The default limit is 600 requests per minute per IP. Sign-in, uploads, form posts and tokens have
  lower limits, listed on each route.
- Over the limit, the answer is `429 RATE_LIMITED` with `Retry-After` (seconds).
- Back off exponentially; never retry a 4xx other than 429 without changing the request.

## Idempotency (partner writes)

- Send a fresh UUID in `Idempotency-Key` for every logical write.
- Retrying with the same key and the same body returns the first answer again, with
  `Idempotent-Replayed: true`. This is safe after a timeout.
- The same key with a different body is refused: `409 IDEMPOTENCY_KEY_REUSED`.
- Keys are kept for 24 hours.

## Concurrency

- Content edits carry the revision you loaded (`base_revision_id`). If the draft moved on, the answer
  is `412 CONFLICT_BASE_REVISION` (console) or `409` (forms); reload and reapply.
- Partner change requests whose fields were changed underneath move to `needs_rebase`, with
  `conflicts`. Resubmit after checking.

## Identifiers, time, language

- Ids are prefixed ULIDs (`cr_`, `rev_`, `ast_`, `tkt_`, `frm_` …) and sort by creation time.
- Timestamps are ISO 8601 in UTC.
- Localized text is `{ "fa": "…", "en": "…", "tr": "…" }`. A missing language falls back:
  tr → en → fa, and en → fa.

## Lists and paging

Lists return at most a stated number of newest rows (e.g. 60 tickets, 200 change requests). Where
paging exists it is keyset paging:
- `before`: the last row's `last_activity_at` for tickets, the last `seq` for the audit log;
- `cursor`: the last id, for media.

## Privacy

- Form answers, ticket messages and requester details are encrypted at rest.
- The audit log never holds personal data.
- Every read of a ticket or attachment is audited.
