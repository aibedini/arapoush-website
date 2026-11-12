import { createHash, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from "jose";
import { Secret, TOTP } from "otpauth";
import { loadConfig } from "./config.ts";
import { openDb, type Db } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { buildApp } from "./app.ts";
import { MODULES } from "./modules.ts";
import { contractChecker } from "./openapi/verify.ts";
import { createOperator } from "./auth/routes.ts";
import { seedContent } from "./content/seed.ts";

/** A fresh in-memory OPEX (PGlite, all migrations) for tests. */
export async function testApp(env: Record<string, string> = {}, opts: { seed?: boolean } = {}) {
  const config = loadConfig({ NODE_ENV: "test", PUBLIC_URL: "http://opex.test", ...env } as NodeJS.ProcessEnv);
  const db = await openDb({ memory: true });
  await migrate(db);
  if (opts.seed) await seedContent({ config, db });
  const checker = contractChecker();
  const app = await buildApp({ config, db }, MODULES, { onPayload: checker.onPayload });
  return {
    app,
    db,
    config,
    close: async () => {
      await app.close();
      await db.close();
      // `pnpm docs:coverage`: which documented operation/status pairs the tests exercised.
      if (process.env.CONTRACT_COVERAGE_FILE) appendFileSync(process.env.CONTRACT_COVERAGE_FILE, [...checker.seen].map((s) => s + String.fromCharCode(10)).join(""));
      // D2: a response that does not match its documented contract fails the test.
      if (checker.violations.length) {
        const lines = checker.violations.map((v) => `  ${v.route} → ${v.status}: ${v.problem}`);
        throw new Error(["API responses differ from their contracts:", ...new Set(lines)].join(String.fromCharCode(10)));
      }
    },
  };
}

/** TOTP code `steps` periods from now (each code is accepted once, so tests step forward). */
export const totpAt = (secret: string, steps = 0) => new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + steps * 30_000 });

export type Operator = { cookie: string; csrf: string; secret: string; step: number; id: string };

/** Creates an operator, signs in (password → enrol TOTP → code) and returns cookie + CSRF. */
export async function signIn(app: FastifyInstance, deps: { db: Db; config: ReturnType<typeof loadConfig> }, role = "super_admin", email = `op-${randomBytes(4).toString("hex")}@opex.test`): Promise<Operator> {
  const password = "correct horse battery staple 42";
  const id = await createOperator(deps, email, "Test Operator", role, password);
  const login = await app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email, password } });
  const { challenge } = login.json();
  const enroll = await app.inject({ method: "POST", url: "/v1/manage/auth/mfa/enroll", payload: { challenge } });
  const { secret } = enroll.json();
  const mfa = await app.inject({ method: "POST", url: "/v1/manage/auth/mfa", payload: { challenge, code: totpAt(secret) } });
  const cookie = String(mfa.headers["set-cookie"]).split(";")[0]!;
  return { cookie, csrf: mfa.json().csrf, secret, step: 0, id };
}

/** Step-up with the next unused TOTP step. */
export async function stepUp(app: FastifyInstance, op: Operator) {
  op.step += 1;
  const r = await app.inject({ method: "POST", url: "/v1/manage/auth/step-up", headers: { cookie: op.cookie, "x-csrf-token": op.csrf }, payload: { code: totpAt(op.secret, op.step) } });
  if (r.statusCode !== 200) throw new Error(`step-up failed: ${r.body}`);
}

export const as = (op: Operator) => ({ cookie: op.cookie, "x-csrf-token": op.csrf });

/** A simulated AraCMS: its client key (private_key_jwt) and a DPoP key, both kept on the AraCMS server. */
export async function partnerKeys() {
  const client = await generateKeyPair("ES256", { extractable: true });
  const dpop = await generateKeyPair("ES256", { extractable: true });
  const clientJwk: JWK = { ...(await exportJWK(client.publicKey)), kid: "aracms-1", alg: "ES256", use: "sig" };
  const dpopJwk = await exportJWK(dpop.publicKey);
  return { client, dpop, clientJwk, dpopJwk };
}

export async function clientAssertion(clientId: string, key: CryptoKey, aud: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "aracms-1" }).setIssuer(clientId).setSubject(clientId).setAudience(aud).setJti(randomBytes(12).toString("hex")).setIssuedAt().setExpirationTime("2m").sign(key);
}

export async function dpopProof(key: CryptoKey, jwk: JWK, method: string, url: string, accessToken?: string) {
  const claims: Record<string, unknown> = { htm: method, htu: url };
  if (accessToken) claims.ath = createHash("sha256").update(accessToken).digest("base64url");
  return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk }).setJti(randomBytes(12).toString("hex")).setIssuedAt().sign(key);
}

export const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

/**
 * A signed-in AraCMS user (authorization code + PKCE + TOTP), with a `call` that sends DPoP proofs,
 * RFC 9421 signatures and Idempotency-Keys exactly as the PHP reference client does.
 */
export async function partnerSession(app: Pick<FastifyInstance, "inject">, admin: Operator, o: { role?: string; scopes?: string[]; email?: string; origin?: string } = {}) {
  const origin = o.origin ?? "http://opex.test";
  const { KeyObject, sign: cryptoSign, randomUUID } = await import("node:crypto");
  const { contentDigest, signatureBase } = await import("./partner/integrity.ts");
  const k = await partnerKeys();
  const scopes = o.scopes ?? ["content:read", "content:propose", "media:upload", "cr:read", "cr:withdraw"];
  const created = await app.inject({ method: "POST", url: "/v1/manage/partners", headers: as(admin), payload: { name: "AraCMS", allowed_cidrs: ["127.0.0.1/32"], jwks: { keys: [k.clientJwk] }, redirect_uris: ["https://aracms.test/callback"], scopes } });
  if (created.statusCode !== 200) throw new Error(created.body);
  const { id: partnerId, client_id } = created.json();
  const email = o.email ?? `editor-${randomBytes(3).toString("hex")}@aracms.test`;
  const password = "blue tubes print daily 2026";
  const u = await app.inject({ method: "POST", url: `/v1/manage/partners/${partnerId}/users`, headers: as(admin), payload: { email, display_name: "Sara (AraCMS)", role: o.role ?? "aracms_editor", password } });
  if (u.statusCode !== 200) throw new Error(u.body);
  const { verifier, challenge } = pkce();
  const form = (x: Record<string, string>) => new URLSearchParams(x).toString();
  const params = { response_type: "code", client_id, redirect_uri: "https://aracms.test/callback", code_challenge: challenge, code_challenge_method: "S256", state: "s", scope: scopes.join(" ") };
  const pw = await app.inject({ method: "POST", url: "/oauth/authorize", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: form({ ...params, stage: "password", email, password }) });
  const ch = /name="challenge" value="([^"]+)"/.exec(pw.body)![1]!;
  const secret = /<code>([A-Z2-7]+)<\/code>/.exec(pw.body)![1]!;
  const done = await app.inject({ method: "POST", url: "/oauth/authorize", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: form({ ...params, stage: "code", challenge: ch, code: totpAt(secret) }) });
  const code = new URL(String(done.headers.location)).searchParams.get("code")!;
  const tokenUrl = `${origin}/oauth/token`;
  const tok = await app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded", dpop: await dpopProof(k.dpop.privateKey, k.dpopJwk, "POST", tokenUrl) },
    payload: form({ client_id, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: await clientAssertion(client_id, k.client.privateKey, tokenUrl), grant_type: "authorization_code", code, redirect_uri: "https://aracms.test/callback", code_verifier: verifier }),
  });
  if (tok.statusCode !== 200) throw new Error(tok.body);
  const at = tok.json().access_token as string;
  const signKey = KeyObject.from(k.client.privateKey);

  type CallOpts = { body?: unknown; raw?: Buffer; idem?: string; unsigned?: boolean; tamper?: boolean; headers?: Record<string, string>; endUserIp?: string };
  const call = async (method: string, path: string, c: CallOpts = {}) => {
    const url = `${origin}${path}`;
    const headers: Record<string, string> = { authorization: `DPoP ${at}`, dpop: await dpopProof(k.dpop.privateKey, k.dpopJwk, method, url.split("?")[0]!, at), ...(c.headers ?? {}) };
    const payload = c.raw ?? (c.body !== undefined ? Buffer.from(JSON.stringify(c.body)) : undefined);
    if (payload) headers["content-type"] = c.raw ? "application/octet-stream" : "application/json";
    if (method !== "GET") {
      headers["idempotency-key"] = c.idem ?? randomUUID();
      if (c.endUserIp) headers["x-end-user-ip"] = c.endUserIp;
      if (payload) headers["content-digest"] = contentDigest(payload);
      if (!c.unsigned) {
        const comps = ["@method", "@path", "idempotency-key", ...(payload ? ["content-digest"] : []), ...(c.endUserIp ? ["x-end-user-ip"] : [])];
        const paramsRaw = `(${comps.map((x) => `"${x}"`).join(" ")});created=${Math.floor(Date.now() / 1000)};keyid="aracms-1";alg="ecdsa-p256-sha256";nonce="${randomBytes(12).toString("hex")}"`;
        const base = signatureBase({ method, path: path.split("?")[0]!, headers }, comps, paramsRaw);
        const sig = cryptoSign("sha256", Buffer.from(base), { key: signKey, dsaEncoding: "ieee-p1363" }).toString("base64");
        headers["signature-input"] = `sig1=${paramsRaw}`;
        headers.signature = `sig1=:${sig}:`;
      }
    }
    return app.inject({ method: method as "GET", url: path, headers, payload: c.tamper && payload ? Buffer.concat([payload, Buffer.from(" ")]) : payload });
  };
  return { partnerId, client_id, call, role: o.role ?? "aracms_editor" };
}
