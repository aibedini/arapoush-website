import { z } from "zod";
import type { RouteContract } from "./contract.ts";
import { genericErrors } from "./generate.ts";
import { CONTRACTS } from "./registry.ts";
import { SITE } from "./site.ts";

/**
 * Generated documentation artifacts (D3), deterministic like the OpenAPI files:
 * - errors.md: every error code, its HTTP status, what it means and which routes return it;
 * - a Postman collection (v2.1) with placeholder environments.
 */

export function errorCatalogue(): string {
  const codes = new Map<string, { status: Set<number>; when: Set<string>; routes: Set<string> }>();
  for (const c of CONTRACTS) {
    for (const e of [...genericErrors(c), ...(c.errors ?? [])]) {
      const k = e.code;
      const v = codes.get(k) ?? { status: new Set(), when: new Set(), routes: new Set() };
      v.status.add(e.status);
      v.when.add(e.when);
      v.routes.add(`${c.method} ${c.path}`);
      codes.set(k, v);
    }
  }
  const rows = [...codes].sort(([a], [b]) => a.localeCompare(b));
  const out = [
    "# Error codes (generated)",
    "",
    "Every error OPEX returns is `application/problem+json` with a stable `code` (except the OAuth token endpoint, which uses RFC 6749 `error`). Match on `code`, never on `detail` (that text is for people and may change). Validation errors add `issues: [{ path, message }]`.",
    "",
    "Generated from the route contracts by `pnpm docs:api`; do not edit.",
    "",
    "| Code | HTTP | Meaning | Routes |",
    "|---|---|---|---|",
    ...rows.map(([code, v]) => {
      const routes = [...v.routes].sort();
      const where = routes.length > 6 ? `${routes.length} routes` : routes.map((r) => `\`${r}\``).join("<br>");
      const when = [...v.when].slice(0, 3).join(" / ").replace(/\|/g, "\\|").replace(/\n/g, " ");
      return `| \`${code}\` | ${[...v.status].sort().join(", ")} | ${when} | ${where} |`;
    }),
    "",
  ];
  return out.join("\n");
}

// ── Postman ──
type J = Record<string, unknown>;
const js = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-2020-12", unrepresentable: "any", io: "input", reused: "inline" }) as J;
/** A small, valid-looking example from a JSON schema (required properties only). */
function sample(s: J, depth = 0): unknown {
  if (depth > 6) return null;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.const !== undefined) return s.const;
  const t = [s.type].flat()[0];
  if (Array.isArray(s.anyOf)) return sample(s.anyOf[0] as J, depth + 1);
  if (t === "object") {
    const props = (s.properties ?? {}) as Record<string, J>;
    const req = new Set((s.required ?? []) as string[]);
    return Object.fromEntries(Object.entries(props).filter(([k]) => req.has(k)).map(([k, v]) => [k, sample(v, depth + 1)]));
  }
  if (t === "array") return s.minItems ? [sample((s.items ?? {}) as J, depth + 1)] : [];
  if (t === "string") return s.format === "date-time" ? "2026-11-12T09:00:00.000Z" : s.format === "email" ? "someone@example.com" : "string";
  if (t === "integer" || t === "number") return (s.minimum as number) ?? 1;
  if (t === "boolean") return false;
  return null;
}

const AUTH_HEADER: Partial<Record<RouteContract["auth"], { key: string; value: string }>> = {
  delivery: { key: "Authorization", value: "Bearer {{deliveryToken}}" },
  render: { key: "Authorization", value: "Bearer {{renderToken}}" },
  metrics: { key: "Authorization", value: "Bearer {{metricsToken}}" },
  partner: { key: "Authorization", value: "DPoP {{partnerAccessToken}}" },
};

function item(c: RouteContract, base: string) {
  const headers: { key: string; value: string; description?: string }[] = [];
  const a = AUTH_HEADER[c.auth];
  if (a) headers.push(a);
  if (c.auth === "session" && c.method !== "GET") headers.push({ key: "X-CSRF-Token", value: "{{csrf}}", description: "Set automatically after the MFA sign-in request (or GET /v1/manage/auth/csrf)." });
  if (c.auth === "partner") headers.push({ key: "DPoP", value: "{{dpopProof}}", description: "A fresh DPoP proof per request; the PHP reference client makes them. Postman cannot sign these on its own." });
  if (c.signed) headers.push({ key: "Idempotency-Key", value: "{{$guid}}" }, { key: "Signature-Input", value: "{{signatureInput}}" }, { key: "Signature", value: "{{signature}}" });
  for (const h of c.headers ?? []) headers.push({ key: h.name, value: "", description: h.description });
  const pathVars = [...c.path.matchAll(/:(\w+)/g)].map((m) => m[1]!);
  const queryProps = c.query ? Object.keys(((js(c.query).properties ?? {}) as J)) : [];
  const url = {
    raw: `{{${base}}}${c.path}`,
    host: [`{{${base}}}`],
    path: c.path.split("/").filter(Boolean),
    ...(pathVars.length ? { variable: pathVars.map((k) => ({ key: k, value: "" })) } : {}),
    ...(queryProps.length ? { query: queryProps.map((k) => ({ key: k, value: "", disabled: true })) } : {}),
  };
  const ct = c.bodyType ?? "application/json";
  let body: J | undefined;
  if (c.body && ct === "application/json") {
    headers.push({ key: "Content-Type", value: "application/json" });
    body = { mode: "raw", raw: JSON.stringify(c.requestExample ?? sample(js(c.body)), null, 2), options: { raw: { language: "json" } } };
  } else if (c.body && ct === "application/x-www-form-urlencoded") {
    const ex = sample(js(c.body)) as Record<string, unknown>;
    body = { mode: "urlencoded", urlencoded: Object.entries(ex).map(([k, v]) => ({ key: k, value: String(v ?? "") })) };
  } else if (c.body && ct === "multipart/form-data") body = { mode: "formdata", formdata: [{ key: "file", type: "file", src: "" }] };
  else if (c.body) body = { mode: "file", file: { src: "" } };
  const ev = c.id === "mfaVerify" ? [{ listen: "test", script: { type: "text/javascript", exec: ['if (pm.response.code === 200) pm.collectionVariables.set("csrf", pm.response.json().csrf);'] } }] : c.id === "csrfToken" ? [{ listen: "test", script: { type: "text/javascript", exec: ['if (pm.response.code === 200) pm.collectionVariables.set("csrf", pm.response.json().csrf);'] } }] : c.id === "login" ? [{ listen: "test", script: { type: "text/javascript", exec: ['if (pm.response.code === 200) pm.collectionVariables.set("challenge", pm.response.json().challenge);'] } }] : undefined;
  if (c.id === "mfaVerify" && body) body.raw = JSON.stringify({ challenge: "{{challenge}}", code: "123456" }, null, 2);
  return {
    name: `${c.summary}`,
    request: { method: c.method, header: headers, url, ...(body ? { body } : {}), description: `${c.description ?? ""}\n\nSource: ${c.source}`.trim() },
    ...(ev ? { event: ev } : {}),
  };
}

export function postmanCollection(): J {
  const all = [...CONTRACTS, ...Object.values(SITE)];
  const folders = new Map<string, RouteContract[]>();
  for (const c of all) for (const t of c.tags.slice(0, 1)) folders.set(t, [...(folders.get(t) ?? []), c]);
  return {
    info: {
      name: "OPEX + Arapoush website",
      _postman_id: "8f1c0b9e-0d5c-4c8e-9a51-opex00000001",
      description:
        "Generated from the route contracts (`pnpm docs:api`); do not edit by hand. Choose an environment (local or staging). Console routes: run **Sign-in and sessions → Step 1** then **Step 2** (the CSRF token is stored for you). Partner routes need DPoP proofs and RFC 9421 signatures per request: use the PHP reference client, or fill {{dpopProof}}, {{signatureInput}} and {{signature}} yourself. Never put production credentials in an environment.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "csrf", value: "" },
      { key: "challenge", value: "" },
    ],
    item: [...folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, cs]) => ({ name, item: cs.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path))).map((c) => item(c, c.audience === "site" ? "siteUrl" : "baseUrl")) })),
  };
}

export const postmanEnvironment = (name: string, baseUrl: string, siteUrl: string): J => ({
  name,
  values: [
    { key: "baseUrl", value: baseUrl, enabled: true },
    { key: "siteUrl", value: siteUrl, enabled: true },
    { key: "deliveryToken", value: "<DELIVERY_TOKEN>", type: "secret", enabled: true },
    { key: "renderToken", value: "<RENDER_TOKEN>", type: "secret", enabled: true },
    { key: "metricsToken", value: "<METRICS_TOKEN>", type: "secret", enabled: true },
    { key: "partnerAccessToken", value: "<from POST /oauth/token>", type: "secret", enabled: true },
    { key: "dpopProof", value: "<DPoP proof JWT>", type: "secret", enabled: true },
    { key: "signatureInput", value: "<RFC 9421 Signature-Input>", enabled: true },
    { key: "signature", value: "<RFC 9421 Signature>", type: "secret", enabled: true },
  ],
  _postman_variable_scope: "environment",
});
