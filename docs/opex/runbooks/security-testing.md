# Security testing and load testing

Run these on **staging** before go-live and after any change to authentication, the partner API or
the reverse proxy.

## Automated scan (OWASP ZAP)

```bash
# Website and public API surface (passive + spider):
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://staging.arapoush.com/fa -r zap-site.html
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py -t https://opex.staging.arapoush.com/v1/partner/openapi.json -f openapi -r zap-partner.html
```

**Expected:**
- no High or Medium findings;
- the partner API answers 401 to everything unauthenticated.

Attach the reports to the release.

## Manual checks (OWASP ASVS L2, see `docs/opex/asvs-matrix.md`)

- **Console sessions:** after 15 min idle the console asks for sign-in again; after 8 h it does so
  even when active.
- **Console sign-in:** five wrong passwords lock the account; the lockout appears in the audit log.
- **CSRF:** a request without `x-csrf-token` returns 403 `CSRF`, and the cookie is `SameSite=Strict`.
- **Step-up:** creating operators, exporting the audit log, rotating keys and editing locked fields
  all require the authenticator code again.
- **Partner tokens:**
  - a token used without its DPoP key returns 401;
  - a replayed DPoP proof returns 401;
  - an expired access token (> 5 min) returns 401.
- **Partner request integrity:**
  - a request signature older than 60 s returns 401;
  - a replayed nonce returns 401;
  - a body changed after signing returns 401.
- **Media:**
  - an SVG with `<script>` or `onload` is rejected;
  - a PDF with `/JavaScript` is rejected;
  - a renamed EXE (`photo.jpg`) is rejected;
  - an image containing GPS EXIF comes back without it.
- **Forms:**
  - six submissions from one IP within 10 min: the sixth returns 429;
  - honeypot filled: the request looks accepted but nothing is stored;
  - a header injection attempt (`\r\nBcc:`) is removed from the subject.
- **Audit integrity:** `UPDATE audit_events …` as the database user fails with "append-only".

## External penetration test

Before production, commission an external test of the partner API, OAuth flows and console, with
scope from this repository. Fix all High findings before go-live; track Medium ones with dates.

## Load test (k6)

```bash
docker run --rm -i -e BASE=https://staging.arapoush.com -e OPEX=https://opex.staging.arapoush.com grafana/k6 run - < infra/loadtest/k6.js
```

**Targets:**
- the website's static pages: 200 req/s with p95 under 300 ms (they are prerendered);
- the public API under 1 % errors.

**Watch while it runs:** `opex_*` metrics, Postgres CPU and the API's memory.
