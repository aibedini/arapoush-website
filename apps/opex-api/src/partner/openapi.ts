import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";

/** OpenAPI 3.1 description of the Partner API (what AraCMS builds against). Served at /v1/partner/openapi.json. */
export function partnerOpenApi(issuer: string) {
  const problem = { $ref: "#/components/responses/Problem" };
  const write = {
    parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }, { $ref: "#/components/parameters/EndUserIp" }],
    security: [{ dpop: [] }],
    "x-opex-signature": "required (RFC 9421; see components.securitySchemes.dpop.description)",
  };
  const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
  const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
  return {
    openapi: "3.1.0",
    info: {
      title: "OPEX Partner API",
      version: "1.0.0",
      description:
        "Read granted content and propose changes as change requests. Every call needs a DPoP-bound access token (OAuth 2.1, private_key_jwt). Every write also needs an Idempotency-Key and an HTTP Message Signature (RFC 9421, alg ecdsa-p256-sha256) covering @method, @path, idempotency-key, content-digest (when there is a body) and x-end-user-ip (when sent), created within ±60 s, with a single-use nonce. Errors are RFC 9457 problem+json with a stable `code`.",
    },
    servers: [{ url: issuer }],
    components: {
      securitySchemes: {
        dpop: { type: "http", scheme: "DPoP", description: "Authorization: DPoP <access token>, plus a DPoP proof JWT (htm, htu, ath) per request. Signature-Input/Signature headers on writes." },
      },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 80 }, description: "A UUID. The same key and body replay the first answer (Idempotent-Replayed: true); the same key with another body is refused (409 IDEMPOTENCY_KEY_REUSED)." },
        EndUserIp: { name: "X-End-User-IP", in: "header", required: false, schema: { type: "string" }, description: "The AraCMS user's IP, recorded in the audit log. Must be covered by the signature when sent." },
      },
      responses: { Problem: { description: "RFC 9457 problem", content: { "application/problem+json": { schema: ref("Problem") } } } },
      schemas: {
        Problem: { type: "object", properties: { code: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" }, instance: { type: "string" }, issues: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } } } },
        Item: {
          type: "object",
          required: ["entry", "base_revision_id", "path"],
          additionalProperties: false,
          properties: {
            entry: { type: "string", examples: ["page.printing"] },
            base_revision_id: { type: "string", description: "The revision you read (GET /content/{type} → base_revision_id)." },
            path: { type: "string", examples: ["/tech/items[id=flexo]/summary"], description: "Field path; list items by key [id=…] or index [n]." },
            locale: { enum: ["fa", "en", "tr"], description: "For localized text: the one language this item changes." },
            op: { enum: ["set", "insert", "remove"], default: "set", description: "insert appends to the list at path (grant entry.create); remove deletes the item at path (grant entry.delete)." },
            value: { description: "New value. For images: { asset: 'ast_…', alt?: { fa, en, tr } } using an id from POST /media." },
          },
        },
        ChangeRequestInput: { type: "object", required: ["title", "items"], additionalProperties: false, properties: { title: { type: "string", maxLength: 200 }, note: { type: "string", maxLength: 2000 }, items: { type: "array", minItems: 1, maxItems: 200, items: ref("Item") } } },
        Decision: { type: "object", properties: { effect: { enum: ["auto_approve", "require_review", "deny"] }, autoPublish: { type: "boolean" }, fourEyes: { type: "boolean" }, policy: { type: ["string", "null"] }, reasons: { type: "array", items: { type: "string" } } } },
        State: { enum: ["submitted", "pending_review", "approved", "published", "rejected", "withdrawn", "needs_rebase", "expired"] },
        Conflict: { type: "object", properties: { item: { type: "string" }, path: { type: "string" }, expected: {}, current: {} } },
        ChangeRequest: {
          type: "object",
          properties: { id: { type: "string" }, title: { type: "string" }, state: ref("State"), decision: ref("Decision"), conflicts: { type: ["array", "null"], items: ref("Conflict") }, items: { type: "array", items: { type: "object" } } },
        },
        Webhook: {
          type: "object",
          description: "POSTed to your webhook URL with OPEX-Signature: t=<unix>, v1=<hex HMAC-SHA256(secret, t + '.' + body)>. Reject skew over 5 min and repeated ids.",
          properties: { id: { type: "string" }, event: { enum: ["cr.state_changed", "content.published"] }, data: { type: "object" }, created: { type: "string", format: "date-time" } },
        },
      },
    },
    security: [{ dpop: [] }],
    paths: {
      "/v1/partner/me": { get: { summary: "Who am I: principal, scopes and effective grants", responses: { 200: json({ type: "object" }), 401: problem } } },
      "/v1/partner/schema": { get: { summary: "Types and fields you may read (schema) and propose (proposable)", responses: { 200: json({ type: "array" }) } } },
      "/v1/partner/content/{type}": {
        get: { summary: "Current draft, projected to your grants", parameters: [{ name: "type", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json({ type: "object", properties: { base_revision_id: { type: "string" }, data: { type: "object" } } }), 403: problem } },
      },
      "/v1/partner/content/{type}/history": {
        get: { summary: "Revisions (or one revision's projected data with ?revision=)", parameters: [{ name: "type", in: "path", required: true, schema: { type: "string" } }, { name: "revision", in: "query", schema: { type: "string" } }], responses: { 200: json({}) } },
      },
      "/v1/partner/media": {
        post: { ...write, summary: "Upload a file (the raw bytes); images are re-encoded to WebP and stripped of metadata", parameters: [...write.parameters, { name: "X-Filename", in: "header", schema: { type: "string" } }], requestBody: { content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, responses: { 200: json({ type: "object", properties: { asset: { type: "string" }, status: { type: "string" } } }), 400: problem } },
      },
      "/v1/partner/media/{id}": { get: { summary: "Status of your upload", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json({}) } } },
      "/v1/partner/change-requests": {
        post: { ...write, summary: "Propose changes; the policy engine decides at once", requestBody: { required: true, ...json(ref("ChangeRequestInput")) }, responses: { 201: json({ type: "object", properties: { id: { type: "string" }, state: ref("State"), decision: ref("Decision") } }), 400: problem, 403: problem, 409: problem } },
        get: { summary: "Your change requests (all of your partner's with cr.read_all)", parameters: [{ name: "state", in: "query", schema: ref("State") }], responses: { 200: json({ type: "array" }) } },
      },
      "/v1/partner/change-requests/{id}": { get: { summary: "Detail with per-item decisions and reasons", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json(ref("ChangeRequest")) } } },
      "/v1/partner/change-requests/{id}/withdraw": { post: { ...write, summary: "Withdraw an open change request", parameters: [...write.parameters, { name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json({}), 409: problem } } },
      "/v1/partner/change-requests/{id}/resubmit": {
        post: { ...write, summary: "After needs_rebase: confirm your items against the newest revisions", parameters: [...write.parameters, { name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: json({ type: "object", properties: { base_revision_ids: { type: "object", additionalProperties: { type: "string" } } } }), responses: { 200: json({}), 409: problem } },
      },
      "/v1/partner/previews": { post: { ...write, summary: "A 30-minute link to the website with your change request applied", requestBody: json({ type: "object", properties: { cr: { type: "string" }, locale: { enum: ["fa", "en", "tr"] } } }), responses: { 200: json({ type: "object", properties: { url: { type: "string" } } }) } } },
    },
    webhooks: { crStateChanged: { post: { requestBody: json(ref("Webhook")), responses: { 204: { description: "Accepted" } } } } },
  };
}

export async function openApiModule(app: FastifyInstance, deps: Deps) {
  const doc = partnerOpenApi(deps.config.PUBLIC_URL);
  app.get("/v1/partner/openapi.json", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return doc;
  });
}
