import { buildSpec } from "./generate.ts";
import { CONTRACTS } from "./registry.ts";
import { SITE } from "./site.ts";

export const API_VERSION = "1.12.0";

const COMMON = `
**Errors** are RFC 9457 \`application/problem+json\` with a stable \`code\` (the OAuth token endpoint uses RFC 6749 errors instead). Validation errors list \`issues\` (path + message). Every answer carries \`X-Request-Id\`; quote it when reporting a problem.

**Rate limits** default to 600 requests per minute per IP; routes that differ say so. Over the limit: 429 \`RATE_LIMITED\` with \`Retry-After\`.

**Timestamps** are ISO 8601 UTC. **Ids** are prefixed ULIDs (\`cr_\`, \`ast_\`, \`rev_\`, \`tkt_\`…): sortable by creation time.`;

/** Partner view: what AraCMS builds against (published at /v1/partner/openapi.json and /docs/partner). */
export const partnerSpec = (server: string) =>
  buildSpec(CONTRACTS, {
    title: "OPEX Partner API",
    version: API_VERSION,
    server,
    audiences: ["partner", "oauth"],
    webhooks: true,
    description: `Read the website content you are granted and propose changes as change requests; OPEX's policy engine and operators decide.

**Sign-in.** OAuth 2.1: authorization code with PKCE for AraCMS staff (they sign in on OPEX, never in AraCMS), or client credentials for the AraCMS server itself. Clients authenticate with \`private_key_jwt\` (ES256). Every access token is DPoP-bound: send \`Authorization: DPoP <token>\` and a fresh \`DPoP\` proof on each request.

**Writes** (uploads, change requests, withdraw, resubmit, previews) also need an \`Idempotency-Key\` and an RFC 9421 HTTP message signature (alg ecdsa-p256-sha256) covering \`@method\`, \`@path\`, \`idempotency-key\`, \`content-digest\` (with a body) and \`x-end-user-ip\` (when sent), created within ±60 s, with a single-use nonce. The PHP reference client (clients/php-reference) does all of this.

**Webhooks** tell you when your change requests move and when content is published; verify \`OPEX-Signature\` on the raw body.
${COMMON}`,
  });

/** Internal reference: every route (console behind login, /docs). */
export const fullSpec = (server: string) =>
  buildSpec(CONTRACTS, {
    title: "OPEX API (internal reference)",
    version: API_VERSION,
    server,
    webhooks: true,
    description: `Every HTTP route OPEX serves, generated from the route contracts in \`apps/opex-api/src/**/contract.ts\`.

Audiences:
- **Management API** (\`/v1/manage/*\`): the OPEX console. Cookie session + \`X-CSRF-Token\` on writes; roles viewer < auditor < operator < super_admin (auditors never write); sensitive actions need a fresh authenticator step-up.
- **Delivery API** (\`/v1/delivery/*\`): the website's server, with \`DELIVERY_TOKEN\`.
- **Partner API** and **OAuth**: AraCMS (see the partner reference).
- **Render API** (\`/v1/render/*\`): the 3D renderer, with \`RENDER_TOKEN\`.
- **Operations**: health, readiness, metrics, public media.

Personal data (tickets, form answers) is encrypted at rest and never written to the audit log.
${COMMON}`,
  });

/** The website's own routes (apps/web). */
export const siteSpec = (server: string) =>
  buildSpec(Object.values(SITE), {
    title: "Arapoush website routes",
    version: API_VERSION,
    server,
    description: `HTTP routes the Next.js website serves besides its pages: the form endpoint browsers post to, the OPEX publish webhook, draft previews, and files for crawlers and AI assistants.

These routes answer with plain JSON or empty bodies (not problem+json).`,
  });
