import { calculateJwkThumbprint, compactVerify, createLocalJWKSet, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { createHash } from "node:crypto";
import type { Q } from "../db/index.ts";
import { unauthorized } from "../http/problem.ts";

/** Records a one-time id; false if it was seen before (replay). */
export async function firstUse(q: Q, jti: string, ttlSeconds: number): Promise<boolean> {
  await q(`DELETE FROM jti_seen WHERE expires_at < clock_timestamp()`);
  const rows = await q(`INSERT INTO jti_seen (jti, expires_at) VALUES ($1, clock_timestamp() + make_interval(secs => $2::int)) ON CONFLICT DO NOTHING RETURNING jti`, [jti.slice(0, 200), ttlSeconds]);
  return rows.length === 1;
}

const ALGS = ["ES256", "EdDSA", "PS256"];

/**
 * DPoP (RFC 9449): proves the caller holds the private key the token is bound to. Checks typ, alg,
 * htm/htu, freshness (±60 s), single use (jti) and, for resource requests, the access-token hash.
 * Returns the key thumbprint (jkt).
 */
export async function verifyDpop(q: Q, proof: string | undefined, opts: { method: string; url: string; accessToken?: string }): Promise<string> {
  if (!proof || proof.length > 4000) throw unauthorized("DPoP proof required");
  let header;
  try {
    header = decodeProtectedHeader(proof);
  } catch {
    throw unauthorized("Malformed DPoP proof");
  }
  if (header.typ !== "dpop+jwt" || !header.alg || !ALGS.includes(header.alg) || !header.jwk || (header.jwk as JWK).d) throw unauthorized("Invalid DPoP header");
  const key = await importJWK(header.jwk as JWK, header.alg);
  let payload: Record<string, unknown>;
  try {
    const r = await compactVerify(proof, key);
    payload = JSON.parse(new TextDecoder().decode(r.payload));
  } catch {
    throw unauthorized("DPoP signature invalid");
  }
  const htu = String(payload.htu ?? "").split(/[?#]/)[0];
  if (payload.htm !== opts.method || htu !== opts.url.split(/[?#]/)[0]) throw unauthorized("DPoP proof is for another request");
  const iat = Number(payload.iat);
  if (!Number.isFinite(iat) || Math.abs(Date.now() / 1000 - iat) > 60) throw unauthorized("DPoP proof expired");
  if (typeof payload.jti !== "string" || !(await firstUse(q, `dpop:${payload.jti}`, 120))) throw unauthorized("DPoP proof replayed");
  if (opts.accessToken) {
    const ath = createHash("sha256").update(opts.accessToken).digest("base64url");
    if (payload.ath !== ath) throw unauthorized("DPoP proof not bound to this token");
  }
  return calculateJwkThumbprint(header.jwk as JWK);
}

/**
 * private_key_jwt client authentication (RFC 7523): a short-lived JWT signed with a key the client
 * registered. iss = sub = client_id, aud = this token endpoint, single use.
 */
export async function verifyClientAssertion(q: Q, assertion: string | undefined, client: { client_id: string; jwks: { keys: JWK[] } }, audience: string[]): Promise<void> {
  if (!assertion) throw unauthorized("client_assertion required");
  try {
    const { payload } = await jwtVerify(assertion, createLocalJWKSet(client.jwks as never), { issuer: client.client_id, subject: client.client_id, audience, algorithms: ALGS, maxTokenAge: "5m" });
    if (!payload.exp || payload.exp - Date.now() / 1000 > 300) throw new Error("exp too far");
    if (!payload.jti || !(await firstUse(q, `ca:${client.client_id}:${payload.jti}`, 600))) throw new Error("replay");
  } catch {
    throw unauthorized("Client authentication failed");
  }
}
