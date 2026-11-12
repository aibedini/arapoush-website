# Error codes (generated)

Every error OPEX returns is `application/problem+json` with a stable `code` (except the OAuth token endpoint, which uses RFC 6749 `error`). Match on `code`, never on `detail` (that text is for people and may change). Validation errors add `issues: [{ path, message }]`.

Generated from the route contracts by `pnpm docs:api`; do not edit.

| Code | HTTP | Meaning | Routes |
|---|---|---|---|
| `BAD_BASE_REVISION` | 400 | A base_revision_id does not belong to the item's entry. | `POST /v1/partner/change-requests` |
| `BAD_MERGE` | 400 | Same ticket, or the target was itself merged. | `POST /v1/manage/tickets/:ref/merge` |
| `BAD_TOKEN` | 403 | Wrong token. | `GET /v1/delivery/bundle`<br>`GET /v1/delivery/content/:type`<br>`GET /v1/delivery/forms/:slug`<br>`GET /v1/delivery/preview`<br>`POST /v1/delivery/forms/:slug` |
| `BASE_REQUIRED` | 400 | No new base revision for one of the entries. | `POST /v1/partner/change-requests/:id/resubmit` |
| `CAD_REJECTED` | 400 | Not STEP/GLB, unreadable, empty, too large, too many triangles or too slow (`detail` says which). | `POST /v1/manage/catalogue/tube/models` |
| `CHALLENGE_FAILED` | 403 | TURNSTILE_SECRET is set and the token is missing or invalid. | `POST /v1/delivery/forms/:slug` |
| `CONFLICT_BASE_REVISION` | 409, 412 | With apply: the draft changed since the preview; preview again. / The catalogue draft changed; reload. / The draft changed since you loaded it (`current` is the new revision id); reload and reapply. | `PATCH /v1/manage/entries/:type`<br>`POST /v1/manage/catalogue/tube/import`<br>`POST /v1/manage/catalogue/tube/models/:id/approve`<br>`PUT /v1/manage/entries/:type`<br>`PUT /v1/manage/forms/:id/draft` |
| `CR_STATE` | 409 | Not in a state that allows this. / Not pending review. / Not approved. | `POST /v1/manage/change-requests/:id/amend`<br>`POST /v1/manage/change-requests/:id/approve`<br>`POST /v1/manage/change-requests/:id/publish`<br>`POST /v1/manage/change-requests/:id/reject`<br>`POST /v1/partner/change-requests/:id/resubmit`<br>`POST /v1/partner/change-requests/:id/withdraw` |
| `CSRF` | 403 | Missing or wrong X-CSRF-Token. | 58 routes |
| `EMAIL_TAKEN` | 409 | An account with this email exists. | `POST /v1/manage/operators`<br>`POST /v1/manage/partners/:id/users` |
| `FIELD_LOCKED` | 403 | A locked field changed and you are not a super admin (`paths` lists them). / An item touches a locked or operator-only field. | `PATCH /v1/manage/entries/:type`<br>`POST /v1/partner/change-requests`<br>`PUT /v1/manage/entries/:type` |
| `FORBIDDEN` | 403 | Someone else's session and you are not a super admin. | `POST /v1/manage/sessions/:id/revoke` |
| `FORM_INVALID` | 400 | The draft has issues (or an unknown team key); `issues` lists them. | `POST /v1/manage/forms/:id/publish` |
| `GRANT_DENIED` | 403 | No read grant on this type. / No media.upload grant. / An item touches a field, locale or action you have no grant for. | `GET /v1/partner/content/:type`<br>`GET /v1/partner/content/:type/history`<br>`POST /v1/partner/change-requests`<br>`POST /v1/partner/change-requests/:id/withdraw`<br>`POST /v1/partner/media` |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | No Idempotency-Key header. | `POST /v1/partner/change-requests`<br>`POST /v1/partner/change-requests/:id/resubmit`<br>`POST /v1/partner/change-requests/:id/withdraw`<br>`POST /v1/partner/media`<br>`POST /v1/partner/previews` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | The same Idempotency-Key with a different request. | `POST /v1/partner/change-requests`<br>`POST /v1/partner/change-requests/:id/resubmit`<br>`POST /v1/partner/change-requests/:id/withdraw`<br>`POST /v1/partner/media`<br>`POST /v1/partner/previews` |
| `INVALID_CLIENT` | 400 | Unknown client, or redirect_uri not registered. | `GET /oauth/authorize`<br>`POST /oauth/authorize` |
| `INVALID_REQUEST` | 400 | Missing or malformed parameters. / Bad parameters or unknown stage. | `GET /oauth/authorize`<br>`POST /oauth/authorize` |
| `INVALID_SUBMISSION` | 400 | Some answers fail the form's rules; `issues` gives each field id and a code: required, invalid_email, invalid_phone, invalid_option, too_long, too_short, too_small, too_large, pattern, invalid_number, invalid_date, too_many_files, bad_file, unknown_field. | `POST /v1/delivery/forms/:slug` |
| `JOB_STATE` | 409 | The job is not running (finished, failed or superseded). | `POST /v1/render/jobs/:id/assets`<br>`POST /v1/render/jobs/:id/complete`<br>`POST /v1/render/jobs/:id/fail` |
| `KEY_TAKEN` | 400 | A team with this key exists. | `POST /v1/manage/teams` |
| `MEDIA_NOT_CLEAN` | 400 | Some media is not scanned clean yet (`assets`). / Some media is not scanned clean yet. | `POST /v1/manage/entries/:type/publish`<br>`POST /v1/manage/entries/:type/rollback` |
| `MEDIA_REJECTED` | 400 | Type not allowed, active content, unreadable, malware, or the scanner is down (`detail` says which). / Type not allowed, active content, unreadable file or malware (`detail` says which). / Not a PNG/WebP or unreadable. | `POST /v1/manage/media`<br>`POST /v1/partner/media`<br>`POST /v1/render/jobs/:id/assets` |
| `MFA_ENROLLED` | 409 | An authenticator is already set up. | `POST /v1/manage/auth/mfa/enroll` |
| `MOUNTING_REQUIRED` | 400 | Set the mounting first: a model is never placed by guess. | `POST /v1/manage/catalogue/tube/models/:id/approve` |
| `NETWORK_DENIED` | 403 | The caller's network is not in CONSOLE_ALLOWED_CIDRS. / The call does not come from the partner's allowed network (or mTLS certificate, when configured). | 112 routes |
| `NO_CHART` | 400 | None of the files could be read as a size chart (`warnings` says why). | `POST /v1/manage/catalogue/tube/import` |
| `NO_DRAFT` | 400 | The entry has no draft. | `POST /v1/manage/render` |
| `NO_EMAIL` | 400 | The ticket has no customer email address. | `POST /v1/manage/tickets/:ref/replies` |
| `NO_FILE` | 400 | No file part. / Body is not application/octet-stream. | `POST /v1/manage/media`<br>`POST /v1/partner/media`<br>`POST /v1/render/jobs/:id/assets` |
| `NOT_FOUND` | 404 | No such session. / No such operator. / No closure with that id in the catalogue draft. | 67 routes |
| `NOTHING_TO_CHANGE` | 400 | No fields given. | `PATCH /v1/manage/partners/:id` |
| `NOTHING_TO_PUBLISH` | 400 | No draft. | `POST /v1/manage/entries/:type/publish` |
| `PATH_NOT_FOUND` | 400 | A path does not exist in the draft. / An item path does not exist in the draft. | `PATCH /v1/manage/entries/:type`<br>`POST /v1/partner/change-requests` |
| `POLICY_TOO_BROAD` | 400 | Auto-approve policies must name the content types they cover. | `POST /v1/manage/policies`<br>`PUT /v1/manage/policies/:id` |
| `RATE_LIMITED` | 429 | More than 600 requests per minute from one IP. / More than 10 per minute per IP. / More than 3000 per minute per IP. | 138 routes |
| `ROLE_DENIED` | 403 | Role below auditor. / Role below viewer. / Role below viewer (auditors never write). | 100 routes |
| `SCANNER_UNAVAILABLE` | 503 | A file could not be virus-scanned; try again. | `POST /v1/delivery/forms/:slug` |
| `SCHEDULE_IN_PAST` | 400 | Less than one minute ahead. | `POST /v1/manage/entries/:type/schedule` |
| `SCOPE_DENIED` | 403 | The token lacks the scope this route needs. | 12 routes |
| `SELF_CHANGE` | 403 | You cannot change your own role or status. | `PATCH /v1/manage/operators/:id` |
| `SLUG_TAKEN` | 409 | A form with this address exists. | `POST /v1/manage/forms`<br>`POST /v1/manage/forms/:id/duplicate` |
| `STEP_UP_REQUIRED` | 403 | No authenticator confirmation in the last 5 minutes (POST /v1/manage/auth/step-up, then retry). / A super admin changed a locked field without a fresh authenticator confirmation. / global.* entries need a fresh authenticator confirmation. | 22 routes |
| `SYSTEM_FORM` | 403 | Built-in forms (quote, contact) cannot be archived. | `POST /v1/manage/forms/:id/status` |
| `TOO_LARGE` | 400 | Larger than 25 MB. | `POST /v1/manage/media` |
| `TOO_MANY_INQUIRIES` | 429 | This visitor IP sent more than the form's limit in 10 minutes. | `POST /v1/delivery/forms/:slug` |
| `UNAUTHENTICATED` | 401 | No valid console session. / Wrong email or password, account locked or not active (same message for all). / Challenge expired; sign in again. | 126 routes |
| `UNKNOWN_ASSET` | 400, 403 | A value names an asset that is not yours and not public. / An asset was not uploaded by the renderer. | `POST /v1/partner/change-requests`<br>`POST /v1/render/jobs/:id/complete` |
| `UNKNOWN_FORM` | 400 | No published form with this slug. | `POST /v1/delivery/forms/:slug` |
| `UNKNOWN_ITEM` | 400 | A decision names an item not in this request. / No such set item. | `POST /v1/manage/change-requests/:id/amend`<br>`POST /v1/manage/change-requests/:id/approve` |
| `UNKNOWN_OPERATOR` | 400 | Not an active operator. | `POST /v1/manage/tickets/:ref/assign`<br>`POST /v1/manage/tickets/:ref/refer`<br>`POST /v1/manage/tickets/bulk`<br>`PUT /v1/manage/teams/:id/members` |
| `UNKNOWN_TEAM` | 400 | No such team. | `PATCH /v1/manage/tickets/:ref`<br>`POST /v1/manage/tickets/:ref/refer`<br>`POST /v1/manage/tickets/bulk` |
| `VALIDATION_FAILED` | 400 | The request does not match the schema; `issues` lists each field. / The result does not match the catalogue schema (`issues`). / The content does not match the schema (`issues`, up to 50). | 100 routes |
| `VALUE_REQUIRED` | 400 | A set or insert item has no value. | `POST /v1/partner/change-requests` |
| `WEAK_PASSWORD` | 400 | Shorter than 12 or longer than 128 characters, contains your email name, or (in production) appears in known breaches; `detail` says which. / The temporary password fails the policy. / The password fails the policy. | `POST /v1/manage/auth/password`<br>`POST /v1/manage/operators`<br>`POST /v1/manage/partners/:id/users` |
| `WRONG_ENTRY` | 400 | The revision belongs to another entry. | `POST /v1/manage/entries/:type/publish`<br>`POST /v1/manage/entries/:type/rollback` |
