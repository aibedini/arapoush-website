# AraCMS go-live checklist

Do every step on the **sandbox** (`TENANT=arapoush-sandbox`) first, then on production.

## 1. Registration (OPEX super admin)

- [ ] **Partner client:** AraCMS sends its public client JWK (`clientPublicJwk()`), its server IPs
      and its callback URL. In Partners → New partner, add:
  - [ ] the JWK, the CIDRs and the exact redirect URI;
  - [ ] the scopes (`content:read content:propose media:upload cr:read cr:withdraw`).
- [ ] **Client id:** give AraCMS the `client_id`, over a channel other than the one the key came
      through.
- [ ] **Webhook:** set the webhook URL and give AraCMS the secret, which is shown once, through the
      password manager.
- [ ] **Users:** create AraCMS users with roles. Each user sets up an authenticator at first sign-in.
- [ ] **mTLS (optional):** register the certificate fingerprint and enable `client_auth` in the
      Caddyfile.

## 2. Initial grants (least privilege; widen later)

| Role | Types | Fields | Languages | Actions |
|---|---|---|---|---|
| `aracms_editor` | `page.printing`, `page.home.*` except `page.home.layout`, `product.*.page` | `/**`, excluding `/meta/**` | fa, en, tr | read, propose, media.upload, cr.withdraw |
| `aracms_translator` | same types | `/**` | en, tr | read, propose |
| `aracms_viewer` | same types | `/**` | all | read |

Not granted at go-live:
- `global.site` (header, footer, contact details);
- `page.home.layout`;
- `product.tube.catalogue`;
- `entry.create` and `entry.delete`.

Locked and operator-only fields can never be granted.

## 3. Initial policies (simulate each before saving)

1. **Small copy fixes:**
   - types `page.printing`, `page.home.*`, `product.*.page`;
   - conditions: at most 5 items, edit ratio ≤ 20 %, no links, no new media, role `aracms_editor`;
     Saturday to Wednesday, 08:00–18:00 Tehran; at most 10 per hour;
   - effect: auto-approve, **without** auto-publish for the first month.
2. Everything else goes to review (the default).

After the first month, review the decisions in the audit log (`cr.policy_decision`) and decide
whether to turn on auto-publish.

## 4. End-to-end test with AraCMS (sandbox)

- [ ] **Sign-in:** a user signs in (password + authenticator); a refresh works; reusing an old
      refresh token ends the session.
- [ ] **Reading:** `content('page.printing')` shows only granted fields and languages.
- [ ] **Small edit:** a small typo fix auto-approves. A larger edit goes to review; an operator
      approves part of it, rejects the rest with reasons, and AraCMS receives `cr.state_changed`
      webhooks.
- [ ] **Conflict:** an operator edits the same field, the request becomes `needs_rebase`, AraCMS
      resubmits, and the request is approved.
- [ ] **Media:** an image upload is proposed, previewed at three widths, then published; the
      website updates in under 10 s.
- [ ] **Refusals:**
  - an unsigned request returns 401;
  - a wrong key returns 401;
  - an IP outside the allowlist returns 403;
  - a locked field returns `FIELD_LOCKED`.
- [ ] **Audit:** the log shows who, what, when, from which IP (AraCMS server and end user) and via
      which client, for every step.

## 5. Production

- [ ] **Credentials:** issue production credentials, which differ from the sandbox.
- [ ] **Watch the first week:** daily review of the Requests page and the `authz.denied` events.
- [ ] **Alerts:** confirm Prometheus alerts reach the on-call phone.
