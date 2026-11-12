import { z, type ZodType } from "zod";
import { ProblemSchema, type Audience, type ErrorSpec, type RouteContract } from "./contract.ts";
import { WEBHOOKS } from "./webhooks.ts";

/**
 * Builds OpenAPI 3.1 documents from the route contracts. Deterministic: the same contracts always
 * produce byte-identical JSON (sorted paths), so `pnpm docs:api:check` can fail on drift.
 */

type Json = Record<string, unknown>;
/**
 * Named schemas (`.meta({ id })`) become components; zod emits them as `$defs`, which OpenAPI does not
 * resolve, so they are lifted into `components.schemas` and every ref is rewritten. Request and
 * response forms of one schema can differ (defaults, transforms): outputs keep the id, inputs get
 * an `Input` suffix when they differ.
 */
let defs: Record<string, Json> = {};
const rewrite = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(rewrite);
  if (v && typeof v === "object") {
    const o: Json = {};
    for (const [k, x] of Object.entries(v)) o[k] = k === "$ref" && typeof x === "string" ? x.replace(/^#\/\$defs\//, "#/components/schemas/") : rewrite(x);
    return o;
  }
  return v;
};
const schema = (s: ZodType, io: "input" | "output"): Json => {
  const out = z.toJSONSchema(s, { target: "draft-2020-12", unrepresentable: "any", io, reused: "inline" }) as Json;
  delete out.$schema;
  const local = (out.$defs ?? {}) as Record<string, Json>;
  delete out.$defs;
  const rename: Record<string, string> = {};
  for (const [id, d] of Object.entries(local)) {
    const body = rewrite(d) as Json;
    let name = id;
    if (defs[name] && JSON.stringify(defs[name]) !== JSON.stringify(body)) name = `${id}Input`;
    if (defs[name] && JSON.stringify(defs[name]) !== JSON.stringify(body)) throw new Error(`Schema ${id} has more than two shapes`);
    defs[name] = body;
    rename[id] = name;
  }
  const fix = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === "object") {
      const o: Json = {};
      for (const [k, x] of Object.entries(v)) o[k] = k === "$ref" && typeof x === "string" ? x.replace(/^#\/\$defs\/(.+)$/, (_, id: string) => `#/components/schemas/${rename[id] ?? id}`) : fix(x);
      return o;
    }
    return v;
  };
  return fix(out) as Json;
};

/** One line per tag, shown above each group of operations. */
const TAG_TEXT: Record<string, string> = {
  Access: "Partner grants: which partner roles, users or clients may read and propose which types, fields and locales.",
  "Approval policies": "Rules that decide partner change requests at once (auto-approve, review, deny), and a simulator.",
  Audit: "The tamper-evident audit log: search, chain verification and export.",
  "Change requests": "The review queue for partner proposals: approve (per item, four-eyes), reject, amend, publish.",
  Content: "Content types, drafts, revisions, publishing, schedules, previews and 3D renders.",
  Dashboard: "Console home counters.",
  Delivery: "Published content and forms for the website's server.",
  Forms: "The form builder: drafts, publishing and versions.",
  Helpdesk: "Tickets from forms and email: inbox, conversation, assignment, referral, notes, replies, teams, SLA, notifications.",
  Media: "The media library: uploads and files.",
  OAuth: "OAuth 2.1 for AraCMS: metadata, keys, sign-in, tokens, revocation.",
  Operations: "Health, readiness and metrics.",
  Operators: "Console accounts (super admins manage them).",
  Partner: "What AraCMS calls with a DPoP-bound token: schema, content, uploads, change requests, previews.",
  Partners: "Partner clients (AraCMS), their users, keys and webhook endpoint.",
  "Public files": "Published media served to everyone.",
  Render: "The 3D renderer service: claim jobs, upload images, finish.",
  Website: "Routes the website itself serves: form posts from browsers, the publish webhook, previews, llms.txt, sitemap, robots.",
  "Sign-in and sessions": "Console sign-in (password, then authenticator), step-up, CSRF and sessions.",
  Webhooks: "Outgoing webhook deliveries and retries.",
};

const AUDIENCE_TITLE: Record<Audience, string> = {
  partner: "Partner API (AraCMS)",
  oauth: "OAuth 2.1 (partner sign-in)",
  manage: "Management API (OPEX console)",
  delivery: "Delivery API (website)",
  render: "Render API (3D renderer)",
  ops: "Operations",
  site: "Website routes (apps/web)",
};

const SECURITY: Record<string, Json> = {
  session: { type: "apiKey", in: "cookie", name: "opex_session", description: "Console session (HttpOnly, SameSite=Strict). Writes also need the `X-CSRF-Token` header from GET /v1/manage/auth/csrf. Optional network allowlist (CONSOLE_ALLOWED_CIDRS)." },
  partner: { type: "http", scheme: "DPoP", description: "`Authorization: DPoP <access token>` plus a `DPoP` proof JWT (htm, htu, ath, fresh jti) on every request. Tokens come from POST /oauth/token (private_key_jwt + PKCE)." },
  delivery: { type: "http", scheme: "bearer", description: "`Authorization: Bearer <DELIVERY_TOKEN>`: the website's shared secret. Server-to-server only; never sent to browsers." },
  render: { type: "http", scheme: "bearer", description: "`Authorization: Bearer <RENDER_TOKEN>`: the 3D renderer service." },
  metrics: { type: "http", scheme: "bearer", description: "`Authorization: Bearer <METRICS_TOKEN>`: Prometheus scraper." },
  preview: { type: "apiKey", in: "header", name: "opex-preview", description: "A signed 30-minute preview token from POST /v1/manage/preview or /v1/partner/previews." },
  client: { type: "http", scheme: "bearer", description: "OAuth client authentication: `client_assertion` (private_key_jwt, ES256) in the form body." },
};

/** Errors every route of a kind can return, added to the documented route-specific ones. */
export function genericErrors(c: RouteContract): ErrorSpec[] {
  // The website's routes answer in their own shapes (documented per route), not problem+json.
  if (c.audience === "site") return [];
  const e: ErrorSpec[] = [];
  if (c.body || c.query || c.params) e.push({ status: 400, code: "VALIDATION_FAILED", when: "The request does not match the schema; `issues` lists each field." });
  if (c.auth === "session") {
    e.push({ status: 401, code: "UNAUTHENTICATED", when: "No valid console session." });
    e.push({ status: 403, code: "NETWORK_DENIED", when: "The caller's network is not in CONSOLE_ALLOWED_CIDRS." });
    if (c.method !== "GET") e.push({ status: 403, code: "CSRF", when: "Missing or wrong X-CSRF-Token." });
    if (c.role || c.roles) e.push({ status: 403, code: "ROLE_DENIED", when: `Role below ${c.roles?.join("/") ?? c.role}${c.method !== "GET" ? " (auditors never write)" : ""}.` });
    if (c.stepUp) e.push({ status: 403, code: "STEP_UP_REQUIRED", when: "No authenticator confirmation in the last 5 minutes (POST /v1/manage/auth/step-up, then retry)." });
  }
  if (c.auth === "partner") {
    e.push({ status: 401, code: "UNAUTHENTICATED", when: "Missing, expired or revoked access token, or a bad DPoP proof." });
    e.push({ status: 403, code: "SCOPE_DENIED", when: "The token lacks the scope this route needs." });
    e.push({ status: 403, code: "NETWORK_DENIED", when: "The call does not come from the partner's allowed network (or mTLS certificate, when configured)." });
  }
  if (c.auth === "render" || c.auth === "metrics") {
    const v = c.auth === "render" ? "RENDER_TOKEN" : "METRICS_TOKEN";
    e.push({ status: 401, code: "UNAUTHENTICATED", when: `Missing or wrong \`Authorization: Bearer <${v}>\`.` });
    e.push({ status: 404, code: "NOT_FOUND", when: `${v} is not configured: this API is off.` });
  }
  if (c.auth === "delivery") {
    e.push({ status: 401, code: "UNAUTHENTICATED", when: "No `Authorization: Bearer` header." });
    e.push({ status: 403, code: "BAD_TOKEN", when: "Wrong token." });
  }
  if (c.signed) {
    e.push({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED", when: "No Idempotency-Key header." });
    e.push({ status: 401, code: "UNAUTHENTICATED", when: "Bad request signature (`detail` says why): missing or malformed, not covering the required components, wrong alg, `created` outside ±60 s, content digest mismatch, unknown keyid, does not verify, or a replayed nonce." });
    e.push({ status: 409, code: "IDEMPOTENCY_KEY_REUSED", when: "The same Idempotency-Key with a different request." });
  }
  e.push({ status: 429, code: "RATE_LIMITED", when: c.rateLimit ? `More than ${c.rateLimit}.` : "More than 600 requests per minute from one IP." });
  return e;
}

const openApiPath = (p: string) => p.replace(/:(\w+)/g, "{$1}");

function operation(c: RouteContract): Json {
  const params: Json[] = [];
  const addParams = (o: z.ZodObject | undefined, where: "path" | "query") => {
    if (!o) return;
    const js = schema(o, "input") as { properties?: Record<string, Json>; required?: string[] };
    for (const [name, s] of Object.entries(js.properties ?? {})) {
      const { description, ...rest } = s as Json & { description?: string };
      params.push({ name, in: where, required: where === "path" || !!js.required?.includes(name), schema: rest, ...(description ? { description } : {}) });
    }
  };
  addParams(c.params, "path");
  addParams(c.query, "query");
  for (const h of c.headers ?? []) params.push({ name: h.name, in: "header", required: !!h.required, description: h.description, schema: { type: "string" } });
  if (c.signed) {
    params.push({ $ref: "#/components/parameters/IdempotencyKey" }, { $ref: "#/components/parameters/SignatureInput" }, { $ref: "#/components/parameters/Signature" }, { $ref: "#/components/parameters/EndUserIp" });
  }
  if (c.auth === "partner") params.push({ $ref: "#/components/parameters/DPoP" });

  const responses: Json = {};
  for (const [status, r] of Object.entries(c.responses)) {
    const ct = r.contentType ?? "application/json";
    responses[status] = {
      description: r.description,
      ...(r.headers ? { headers: Object.fromEntries(Object.entries(r.headers).map(([k, d]) => [k, { description: d, schema: { type: "string" } }])) } : {}),
      ...(r.schema || r.example !== undefined ? { content: { [ct]: { ...(r.schema ? { schema: schema(r.schema, "output") } : {}), ...(r.example !== undefined ? { example: r.example } : {}) } } } : {}),
    };
  }
  // Errors grouped by status, each code listed with when it happens.
  const errs = [...genericErrors(c), ...(c.errors ?? [])];
  const byStatus = new Map<number, ErrorSpec[]>();
  for (const e of errs) {
    const list = byStatus.get(e.status) ?? [];
    const same = list.find((x) => x.code === e.code);
    if (same) same.when = `${same.when} Or: ${e.when}`;
    else list.push({ ...e });
    byStatus.set(e.status, list);
  }
  for (const [status, list] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    if (responses[status]) continue;
    responses[status] = {
      description: list.map((e) => `\`${e.code}\`: ${e.when}`).join("\n\n"),
      content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" }, example: { title: list[0]!.code, status, code: list[0]!.code, instance: "req_01J…" } } },
    };
  }

  const extra: string[] = [];
  if (c.auth === "session") extra.push(`**Console role:** ${c.roles ? c.roles.join(" or ") : `${c.role ?? "viewer"} or above`}${c.stepUp ? "; fresh step-up (authenticator) required" : ""}.`);
  if (c.signed) extra.push("**Signed write:** Idempotency-Key and an RFC 9421 HTTP message signature are required (see the partner guide).");
  if (c.rateLimit) extra.push(`**Rate limit:** ${c.rateLimit}.`);
  if (c.audit?.length) extra.push(`**Audit:** records ${c.audit.map((a) => `\`${a}\``).join(", ")}.`);
  extra.push(`**Source:** \`${c.source.startsWith("apps/") ? c.source : `apps/opex-api/src/${c.source}`}\``);

  const sec = c.auth === "none" ? [] : [{ [c.auth]: [] }];
  return {
    operationId: c.id,
    summary: c.summary,
    description: [c.description, ...extra].filter(Boolean).join("\n\n"),
    tags: c.tags,
    security: sec,
    ...(params.length ? { parameters: params } : {}),
    ...(c.body
      ? { requestBody: { required: true, content: { [c.bodyType ?? "application/json"]: { schema: schema(c.body, "input"), ...(c.requestExample !== undefined ? { example: c.requestExample } : {}) } } } }
      : {}),
    responses,
    "x-audience": c.audience,
  };
}

export type Spec = Json;
export function buildSpec(contracts: RouteContract[], o: { title: string; description: string; version: string; server: string; audiences?: Audience[]; webhooks?: boolean }): Spec {
  defs = {};
  const chosen = contracts.filter((c) => !o.audiences || o.audiences.includes(c.audience)).sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
  const paths: Record<string, Json> = {};
  for (const c of chosen) (paths[openApiPath(c.path)] ??= {})[c.method.toLowerCase()] = operation(c);
  const needsProblem = chosen.some((c) => c.audience !== "site");
  const problem = needsProblem ? schema(ProblemSchema, "output") : undefined;
  const hooks = o.webhooks ? WEBHOOKS(o.audiences) : undefined;
  const usedAuth = new Set(chosen.map((c) => c.auth).filter((a) => a !== "none"));
  const tags = [...new Set(chosen.flatMap((c) => c.tags))].sort().map((name) => ({ name, description: TAG_TEXT[name] ?? name }));
  const audiences = [...new Set(chosen.map((c) => c.audience))];
  return {
    openapi: "3.1.1",
    info: { title: o.title, version: o.version, description: o.description, license: { name: "Proprietary", url: "https://arapoush.com" } },
    servers: [{ url: o.server }],
    tags,
    "x-tagGroups": audiences.map((a) => ({ name: AUDIENCE_TITLE[a], tags: [...new Set(chosen.filter((c) => c.audience === a).flatMap((c) => c.tags))].sort() })),
    paths,
    ...(hooks ? { webhooks: hooks } : {}),
    components: {
      securitySchemes: {
        ...Object.fromEntries([...usedAuth].sort().map((a) => [a, SECURITY[a]])),
        ...(hooks ? { opexSignature: { type: "apiKey", in: "header", name: "OPEX-Signature", description: "Webhooks OPEX sends: t=<unix seconds>, v1=<hex HMAC-SHA256(secret, t + '.' + raw body)>. Verify it, reject t older than 5 minutes, and drop repeated event ids." } } : {}),
      },
      schemas: Object.fromEntries(Object.entries({ ...defs, ...(needsProblem ? { Problem: defs.Problem ?? problem } : {}) }).sort(([a], [b]) => a.localeCompare(b))),
      ...(chosen.some((c) => c.signed || c.auth === "partner") ? {
        parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16, maxLength: 80 }, description: "A UUID per logical write. The same key and body replay the first answer (`Idempotent-Replayed: true`); the same key with another body is refused (409 IDEMPOTENCY_KEY_REUSED). Kept 24 hours." },
        SignatureInput: { name: "Signature-Input", in: "header", required: true, schema: { type: "string" }, description: 'RFC 9421, label `sig1`, alg `ecdsa-p256-sha256`, covering `"@method" "@path" "idempotency-key"`, plus `"content-digest"` with a body and `"x-end-user-ip"` when sent; `created` within ±60 s; single-use `nonce`; `keyid` = your client key id.' },
        Signature: { name: "Signature", in: "header", required: true, schema: { type: "string" }, description: "RFC 9421 signature `sig1=:<base64>:` over the signature base." },
        EndUserIp: { name: "X-End-User-IP", in: "header", required: false, schema: { type: "string" }, description: "The AraCMS user's IP, recorded in the audit log. Must be covered by the signature when sent." },
        DPoP: { name: "DPoP", in: "header", required: true, schema: { type: "string" }, description: "DPoP proof JWT (RFC 9449) for this request: htm, htu, iat, jti, ath (hash of the access token), signed with the key the token is bound to." },
      },
      } : {}),
    },
  };
}
