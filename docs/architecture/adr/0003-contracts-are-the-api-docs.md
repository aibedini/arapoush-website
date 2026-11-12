# ADR 0003: Route contracts are the single source of validation, OpenAPI and tests

Status: accepted · 2026-11-12

## Context

- The API has about 130 operations across four audiences: console, AraCMS, website and renderer.
- Hand-written API docs drift. A PHP partner builds against these docs without reading our code.

## Decision

Each module declares its routes in a `contract.ts`, made with `route()`. A contract holds:
- the method, path and audience;
- the auth kind and the minimum role;
- the zod schemas for params, query and body;
- every response status with its schema and error codes;
- examples.

From that one declaration:
- **Handlers** parse their input with the contract's schemas.
- **OpenAPI 3.1** documents are generated with `pnpm docs:api` and committed under `docs/api/`, along
  with the error catalogue and the Postman collection. Partner docs are the partner view only, with
  no internal routes.
- **Tests** check every response in the test suite against its contract: status, body and error
  code. Coverage is 127/127 operations.
- **CI** fails when:
  - a route has no contract;
  - the committed spec is stale;
  - Redocly reports a problem;
  - a breaking change lacks an `API-Break: approved` trailer and a version bump.

## Consequences

- A route change touches its contract first. That is the documentation work, done at the same time.
- Generic errors are added per auth kind by the generator, so contracts list only route-specific
  errors.
- We depend on zod's JSON Schema output (`z.toJSONSchema`). Its `$defs` are lifted into
  `components.schemas` by our generator.
