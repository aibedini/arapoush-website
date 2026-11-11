# Key and secret rotation

Rotate every secret yearly and immediately after any suspected exposure (`incident-response.md`).
Every rotation is a change on the server: back up first, two people present, note it in the change
log.

`keys:generate` prints fresh values for every secret:
```bash
docker compose … run --rm --no-deps opex-api node --no-warnings src/cli.ts keys:generate
```

| Secret | Effect of changing it | How |
|---|---|---|
| `OPEX_JWT_PRIVATE_JWK` (token signing) | Old access tokens stop verifying unless kept | Move the old **public** JWK into `OPEX_JWT_PREVIOUS_JWKS` (`{"keys":[…]}`), set the new private JWK, restart the API. After 1 day (longer than refresh tokens and archive checks need), keep the old public key in a safe place for archive verification and remove it from the env. |
| `SESSION_SECRET` | All console sessions end; operators sign in again | Replace, restart the API. |
| `DELIVERY_TOKEN` | The website can't read content until both sides match | Set the same new value for `DELIVERY_TOKEN` (API) and `OPEX_DELIVERY_TOKEN` (web), restart both together. |
| `SITE_WEBHOOK_SECRET` | Publish webhooks are refused until both match (they retry) | Same value on API and web, restart both. |
| `INQUIRY_KEY` (inquiry encryption) | None if done right | Append the current key to `INQUIRY_KEYS_OLD` (comma separated), set the new key, restart. Old inquiries still open; new ones use the new key. Remove an old key only after its inquiries have aged out (2 years). |
| `METRICS_TOKEN` | Prometheus scrapes fail until updated | Replace in both places. |
| `POSTGRES_PASSWORD` | API can't connect until updated | `ALTER USER opex PASSWORD '…'` in Postgres, then update `.env` and restart the API. |
| AraCMS client key | AraCMS can't get tokens with the old key | AraCMS generates a new key pair; an operator uses "rotate keys" in Partners (all AraCMS sessions end). |
| AraCMS webhook secret | AraCMS rejects webhooks until updated | Partners → Webhook → save (a new secret is shown once); AraCMS updates its config. |
| Operator authenticator | — | Super admin: Operators → reset authenticator; the operator sets it up again at next sign-in. |

**Rotation drill (yearly):**
- Rotate `OPEX_JWT_PRIVATE_JWK` and `INQUIRY_KEY` on staging.
- Confirm that an AraCMS sandbox session keeps working through the token change.
- Confirm that an old inquiry still opens.
- Confirm that `audit:verify-archive` still passes with the previous public key published.
