import { createHash, createPublicKey, verify } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { actorOf } from "../auth/principal.ts";
import { firstUse } from "../oauth/proofs.ts";
import { Problem, badRequest, conflict, unauthorized } from "../http/problem.ts";
import { sha256 } from "../ids.ts";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const SKEW_S = 60;

/** `Content-Digest: sha-256=:<base64>:` over the exact request bytes (RFC 9530). */
export const contentDigest = (body: Buffer | string) => `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;

type Parsed = { label: string; components: string[]; params: Record<string, string | number>; paramsRaw: string };

function parseInput(header: string): Parsed | null {
  const m = /^([a-z0-9_-]+)=\(([^)]*)\)((?:;[a-z]+=(?:"[^"]*"|\d+))*)$/.exec(header.trim());
  if (!m) return null;
  const components = [...m[2]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  const params: Record<string, string | number> = {};
  for (const p of m[3]!.matchAll(/;([a-z]+)=(?:"([^"]*)"|(\d+))/g)) params[p[1]!] = p[2] ?? Number(p[3]);
  return { label: m[1]!, components, params, paramsRaw: `(${m[2]})${m[3]}` };
}

/** The RFC 9421 signature base for the covered components (lower-case header names). */
export function signatureBase(req: { method: string; path: string; headers: Record<string, string | string[] | undefined> }, components: string[], paramsRaw: string) {
  const lines = components.map((c) => {
    if (c === "@method") return `"@method": ${req.method.toUpperCase()}`;
    if (c === "@path") return `"@path": ${req.path}`;
    const v = req.headers[c];
    if (v === undefined) throw badRequest("SIGNATURE_INVALID", `Covered header ${c} is missing`);
    return `"${c}": ${Array.isArray(v) ? v.join(", ") : String(v).trim()}`;
  });
  return [...lines, `"@signature-params": ${paramsRaw}`].join("\n");
}

/**
 * Partner write requests carry an HTTP Message Signature (plan §3.4) made with one of the partner's
 * registered keys: it covers method, path, the body digest, the Idempotency-Key and X-End-User-IP,
 * is at most 60 s old and its nonce is used once.
 */
export function requireSignature(deps: Deps) {
  return async (req: FastifyRequest) => {
    const fail = async (why: string) => {
      await auditNow(deps.db, deps.config.TENANT, { action: "authz.denied", result: "denied", actor: actorOf(req), request: req.info, resource: { rule: "request.signature" }, reason: why });
      return unauthorized(`Request signature: ${why}`);
    };
    const input = parseInput(String(req.headers["signature-input"] ?? ""));
    const sigM = /^([a-z0-9_-]+)=:([A-Za-z0-9+/=]+):$/.exec(String(req.headers.signature ?? "").trim());
    if (!input || !sigM || sigM[1] !== input.label) throw await fail("missing or malformed");
    const need = ["@method", "@path", "idempotency-key", ...(req.rawBody?.length ? ["content-digest"] : []), ...(req.headers["x-end-user-ip"] ? ["x-end-user-ip"] : [])];
    const missing = need.filter((c) => !input.components.includes(c));
    if (missing.length) throw await fail(`must cover ${missing.join(", ")}`);
    if (input.params.alg !== "ecdsa-p256-sha256") throw await fail("alg must be ecdsa-p256-sha256");
    const created = Number(input.params.created);
    if (!created || Math.abs(Date.now() / 1000 - created) > SKEW_S) throw await fail("too old or from the future");
    if (req.rawBody?.length && req.headers["content-digest"] !== contentDigest(req.rawBody)) throw await fail("content digest does not match the body");

    const [client] = await deps.db.q<{ jwks: { keys: Record<string, unknown>[] } }>(`SELECT jwks FROM partner_clients WHERE id = $1`, [req.principal?.partnerClientId]);
    const jwk = client?.jwks.keys.find((k) => k.kid === input.params.keyid);
    if (!jwk) throw await fail("unknown keyid");
    let ok = false;
    try {
      const base = signatureBase({ method: req.method, path: req.url.split("?")[0]!, headers: req.headers }, input.components, input.paramsRaw);
      ok = verify("sha256", Buffer.from(base), { key: createPublicKey({ key: jwk as never, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(sigM[2]!, "base64"));
    } catch (e) {
      if (e instanceof Problem) throw await fail(e.detail ?? "invalid");
    }
    if (!ok) throw await fail("does not verify");
    const nonce = String(input.params.nonce ?? "");
    if (nonce.length < 16) throw await fail("nonce required");
    const fresh = await deps.db.tx((q) => firstUse(q, `sig:${nonce}`, SKEW_S * 2 + 240));
    if (!fresh) throw await fail("nonce replayed");
  };
}

/**
 * Idempotency (plan §3.4): the same key and body replays the first response; the same key with a
 * different body is refused. Only successful responses are stored, so failures can be retried.
 */
export function idempotent<T>(deps: Deps, handler: (req: FastifyRequest, reply: FastifyReply) => Promise<T>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = String(req.headers["idempotency-key"] ?? "");
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw badRequest("IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header (a UUID)");
    const pid = req.principal!.id;
    const hash = sha256(`${req.method} ${req.url.split("?")[0]} ${req.rawBody ? sha256(req.rawBody) : ""}`);
    const [prev] = await deps.db.q<{ request_hash: string; response: unknown; status: number }>(`SELECT request_hash, response, status FROM idempotency_keys WHERE principal_id = $1 AND key = $2 AND expires_at > clock_timestamp()`, [pid, key]);
    if (prev) {
      if (prev.request_hash !== hash) throw conflict("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request");
      reply.header("Idempotent-Replayed", "true");
      return reply.status(prev.status).send(prev.response);
    }
    const result = await handler(req, reply);
    const status = reply.statusCode;
    if (status < 300)
      await deps.db.q(
        `INSERT INTO idempotency_keys (key, principal_id, request_hash, response, status, expires_at) VALUES ($1,$2,$3,$4,$5, clock_timestamp() + interval '24 hours') ON CONFLICT DO NOTHING`,
        [key, pid, hash, JSON.stringify(result ?? null), status],
      );
    return result;
  };
}
