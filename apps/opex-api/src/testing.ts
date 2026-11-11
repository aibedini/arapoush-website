import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from "jose";
import { Secret, TOTP } from "otpauth";
import { loadConfig } from "./config.ts";
import { openDb, type Db } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { buildApp } from "./app.ts";
import { MODULES } from "./modules.ts";
import { createOperator } from "./auth/routes.ts";
import { seedContent } from "./content/seed.ts";

/** A fresh in-memory OPEX (PGlite, all migrations) for tests. */
export async function testApp(env: Record<string, string> = {}, opts: { seed?: boolean } = {}) {
  const config = loadConfig({ NODE_ENV: "test", PUBLIC_URL: "http://opex.test", ...env } as NodeJS.ProcessEnv);
  const db = await openDb({ memory: true });
  await migrate(db);
  if (opts.seed) await seedContent({ config, db });
  const app = await buildApp({ config, db }, MODULES);
  return { app, db, config, close: async () => (await app.close(), await db.close()) };
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
