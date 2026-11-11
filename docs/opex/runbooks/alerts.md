# Monitoring and alerts

- **Metrics source:** `GET /metrics` on the API (internal network only, `Authorization: Bearer
  $METRICS_TOKEN`). Values come from the database.
- **Prometheus scrape config:**
  ```yaml
  - job_name: opex
    scheme: http
    authorization: { credentials_file: /etc/prometheus/opex-metrics-token }
    static_configs: [{ targets: ["opex-api:4000"] }]
  ```
- **Alert rules:** `infra/prometheus-alerts.yml`.

| Alert | Meaning | First action |
|---|---|---|
| `OpexDown` | API not answering | `docker compose ps`, API logs, Postgres health |
| `OpexAuditChainBroken` | Audit rows were changed outside OPEX | `incident-response.md` → audit chain broken. **Page immediately.** |
| `OpexRefreshTokenReuse` | A stolen AraCMS refresh token was presented (session already revoked) | Treat as AraCMS compromise until explained |
| `OpexLoginFailures` | Many failed sign-ins (guessing) | Check IPs in the audit log; tighten `CONSOLE_ALLOW` |
| `OpexDeniedSpike` | Many denied requests | Audit log, filter result = denied |
| `OpexWebhooksDead` | The site or AraCMS stopped receiving events | Webhooks page; fix the endpoint; Retry |
| `OpexEmailsDead` | Inquiry emails failing (SMTP) | Check `SMTP_URL`; inquiries are safe in the console |
| `OpexReviewBacklog` | Change requests waiting over a day | Remind the reviewers |
| `OpexAuditStale` | No audit rows for 24 h on a weekday (jobs or traffic stopped) | Check the API and the website |

Uptime checks from outside (UptimeRobot or similar):
- `https://SITE_DOMAIN/fa` returns 200;
- `https://OPEX_DOMAIN/.well-known/jwks.json` returns 200.
