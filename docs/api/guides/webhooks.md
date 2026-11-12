# Webhooks

OPEX sends `POST application/json` to your endpoint when something you care about happens.

| Receiver | Event | When |
|---|---|---|
| The website (`SITE_WEBHOOK_URL` → `/api/opex/revalidate`) | `content.published` | An entry is published, a form is published, archived or restored, or `cli site:revalidate` runs |
| A partner's webhook URL (set in the console) | `cr.state_changed` | One of its change requests moves (approved, published, rejected, needs_rebase, expired…) |
| A partner's webhook URL | `content.published` | Any content is published |

The payload schemas are in the `webhooks` section of `opex.openapi.json` and `partner.openapi.json`.

```json
{ "id": "evt_01JD…", "event": "cr.state_changed", "data": { "cr": "cr_01JD…", "state": "published" }, "created": "2026-11-12T09:31:00.000Z" }
```

## Verify every delivery

The `OPEX-Signature: t=<unix seconds>, v1=<hex>` header carries `v1 = HMAC-SHA256(secret, t + "." + raw body)`.

1. Read the **raw** body before parsing JSON.
2. Recompute `v1` and compare in constant time.
3. Reject a `t` more than 5 minutes from now.
4. Keep the event `id`s you processed (24 h is enough) and ignore repeats. Delivery is at least once.
5. Answer 2xx quickly and do the work afterwards. Anything else is retried with backoff: 1 minute
   up to 6 hours, 24 attempts. After that the delivery is `dead`, and operators can retry it from the
   console (Webhooks).

PHP (the reference client has this as `Webhook::verify`):

```php
[$t, $v1] = [null, null];
foreach (explode(',', $_SERVER['HTTP_OPEX_SIGNATURE'] ?? '') as $part) {
    [$k, $v] = array_map('trim', explode('=', $part, 2)) + [null, null];
    if ($k === 't') $t = (int) $v; elseif ($k === 'v1') $v1 = $v;
}
$raw = file_get_contents('php://input');
$ok = $t && $v1 && abs(time() - $t) <= 300 && hash_equals(hash_hmac('sha256', "$t.$raw", $secret), $v1);
if (!$ok) { http_response_code(401); exit; }
```

Node (the website's receiver is `apps/web/lib/content/webhook.ts`):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const m = /t=(\d+),\s*v1=([0-9a-f]{64})/.exec(header ?? "");
const ok = !!m && Math.abs(Date.now() / 1000 - Number(m[1])) <= 300
  && timingSafeEqual(Buffer.from(m[2], "hex"), createHmac("sha256", secret).update(`${m[1]}.${raw}`).digest());
```

Secrets:
- The website uses `SITE_WEBHOOK_SECRET` (OPEX) = `OPEX_WEBHOOK_SECRET` (website).
- A partner's secret is shown once when its webhook URL is set; setting the URL again rotates it.
