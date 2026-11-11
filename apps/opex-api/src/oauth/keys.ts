import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exportJWK, generateKeyPair, importJWK, type JWK, type CryptoKey } from "jose";
import type { Config } from "../config.ts";
import { sha256 } from "../ids.ts";

/**
 * Token signing keys (ES256). Production: OPEX_JWT_PRIVATE_JWK (and optionally OPEX_JWT_PREVIOUS_JWKS
 * during rotation, so tokens signed by the old key keep verifying until they expire). Development:
 * a key generated once into DATA_DIR. Tests: an in-memory key.
 */
export type Keys = { kid: string; privateKey: CryptoKey; publicJwks: { keys: JWK[] } };

let cached: Keys | null = null;
// Tests: one in-memory key per OPEX instance (config object), never written to disk.
const memoryKeys = new WeakMap<Config, Promise<Keys>>();

export async function signingKeys(config: Config, opts: { memory?: boolean } = {}): Promise<Keys> {
  if (opts.memory) {
    if (!memoryKeys.has(config)) memoryKeys.set(config, load(config, true));
    return memoryKeys.get(config)!;
  }
  cached ??= await load(config, false);
  return cached;
}

async function load(config: Config, memory: boolean): Promise<Keys> {
  const opts = { memory };
  let priv: JWK;
  if (process.env.OPEX_JWT_PRIVATE_JWK) priv = JSON.parse(process.env.OPEX_JWT_PRIVATE_JWK);
  else {
    if (config.isProd) throw new Error("OPEX_JWT_PRIVATE_JWK must be set in production");
    const file = path.resolve(config.DATA_DIR, "jwt-signing-key.json");
    if (!opts.memory && existsSync(file)) priv = JSON.parse(readFileSync(file, "utf8"));
    else {
      const { privateKey } = await generateKeyPair("ES256", { extractable: true });
      priv = await exportJWK(privateKey);
      if (!opts.memory) {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(priv), { mode: 0o600 });
      }
    }
  }
  const { d: _d, ...pub } = priv;
  const kid = priv.kid ?? sha256(JSON.stringify({ crv: pub.crv, x: pub.x, y: pub.y })).slice(0, 16);
  const previous: JWK[] = process.env.OPEX_JWT_PREVIOUS_JWKS ? JSON.parse(process.env.OPEX_JWT_PREVIOUS_JWKS).keys : [];
  const keys: Keys = {
    kid,
    privateKey: (await importJWK({ ...priv, alg: "ES256" }, "ES256")) as CryptoKey,
    publicJwks: { keys: [{ ...pub, kid, alg: "ES256", use: "sig" }, ...previous] },
  };
  return keys;
}
