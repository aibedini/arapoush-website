# API reference (generated)

| File | What | Audience |
|---|---|---|
| `opex.openapi.json` | Every OPEX route (127 operations) and the webhooks OPEX sends | Internal developers (served in the console in D3) |
| `partner.openapi.json` | Partner API and OAuth, plus partner webhooks; also served live at `/v1/partner/openapi.json` | The AraCMS team |
| `site.openapi.json` | The website's own routes: form posts, publish webhook, previews, llms.txt, sitemap, robots | Internal developers |

All three are OpenAPI 3.1, **generated**. Never edit them by hand.

| Also generated | What |
|---|---|
| `errors.md` | Every error code: HTTP status, meaning, routes |
| `postman/opex.postman_collection.json` | Every route, grouped by tag. Console sign-in stores the CSRF token for you. |
| `postman/local.postman_environment.json`, `postman/staging.postman_environment.json` | Base URLs and **placeholder** secrets; never put real tokens in them |

## Reading the references

| Where | Shows | Who |
|---|---|---|
| `https://opex.arapoush.com/docs/partner` | Partner API and OAuth | Public (AraCMS) |
| Console → «مستندات API» (`/v1/manage/docs`) | Every OPEX route, the website routes and the partner API | Signed-in operators |

Both are rendered by Scalar, self-hosted with a CSP that allows only this origin.

Guides:
- [guides/conventions.md](guides/conventions.md): versions, auth, errors, rate limits, idempotency,
  concurrency, ids.
- [guides/webhooks.md](guides/webhooks.md): payloads and signature verification in PHP and Node.
- [guides/fa/README.md](guides/fa/README.md): the Persian guide for the team.
- [../opex/aracms-integration.md](../opex/aracms-integration.md): the partner integration
  walkthrough.

## Where the truth lives

Each API module has a `contract.ts` next to its `routes.ts`, for example:

- `apps/opex-api/src/tickets/contract.ts`
- `apps/opex-api/src/forms/contract.ts`
- `apps/opex-api/src/partner/contract.ts`

The website's routes are in `apps/opex-api/src/openapi/site.ts`.

A contract holds:
- method, path, operationId, summary and description;
- the audience and how the caller authenticates;
- the lowest console role, and whether a fresh step-up is needed;
- request schemas (params, query, body, headers);
- every response status, with its schema and an example;
- route-specific error codes, with when each happens;
- the rate limit, the audit actions recorded, and the source file.

Handlers parse requests with the **same zod schemas** the contract documents, so the input side of
the docs cannot drift.

Errors every route of a kind can return are added by the generator (`src/openapi/generate.ts`):
validation, missing auth, CSRF, role, step-up, scope, signature, idempotency and rate limit.

## Commands

```bash
pnpm docs:api
```

Regenerates the three files from the contracts.

```bash
pnpm docs:api:check
```

Fails if the committed files differ from what the code produces.

```bash
pnpm docs:lint
```

Lints the specs with Redocly (rules in `redocly.yaml`).

```bash
pnpm docs:breaking
```

Compares the specs with `origin/main`, or the ref given with `--base`.

## What the tests enforce (`apps/opex-api/src/openapi/openapi.test.ts`)

- Every route Fastify registers has exactly one contract, every contract has a route, and every
  operationId is unique.
- Every route file under `apps/web/app` has a site contract.
- The committed JSON equals the generated JSON.
- The partner view contains no internal route.

## Adding or changing a route

1. Write or change the contract in the module's `contract.ts`, with its examples and its error codes.
2. Parse the request in the handler with `CONTRACT.x.body.parse(...)` (and `.query`, `.params`).
3. Run `pnpm docs:api` and commit the regenerated files together with the code.
4. A breaking change (removed operation, field or status, a new required input, narrower input
   rules, a changed type) fails `pnpm docs:breaking`. To ship one on purpose:
   - bump `API_VERSION` in `apps/opex-api/src/openapi/specs.ts` (minor or major);
   - regenerate the specs;
   - add a commit trailer `API-Break: approved <reason>`;
   - tell the AraCMS team first when `partner.openapi.json` changes.

## Contract tests (D2)

- Every response the API tests receive is checked against its route's contract
  (`src/openapi/verify.ts`, wired into `testApp`).
- An undocumented status, an undocumented error code, or a body that does not match the documented
  schema fails the test.
- `src/openapi/walkthrough.test.ts` calls the routes the feature tests do not.

```bash
pnpm docs:coverage
```

Lists the documented operations the tests exercise; today 127 of 127.
