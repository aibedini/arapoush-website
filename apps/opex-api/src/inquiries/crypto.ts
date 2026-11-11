import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Config } from "../config.ts";
import { sha256 } from "../ids.ts";

/**
 * AES-256-GCM for inquiry payloads (PII). Each value records the id of the key that encrypted it,
 * so keys can be rotated: new rows use INQUIRY_KEY, old rows still open with INQUIRY_KEYS_OLD.
 * The row id is bound as associated data, so a ciphertext cannot be moved to another row.
 */
type Key = { id: string; key: Buffer };
const keyOf = (b64: string): Key => {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("Inquiry keys must be 32 bytes (base64)");
  return { id: sha256(key).slice(0, 12), key };
};

export function inquiryKeys(config: Config) {
  const current = keyOf(config.INQUIRY_KEY);
  const all = [current, ...config.INQUIRY_KEYS_OLD.split(",").map((s) => s.trim()).filter(Boolean).map(keyOf)];
  return {
    current,
    encrypt(rowId: string, value: unknown) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", current.key, iv);
      c.setAAD(Buffer.from(rowId));
      const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
      return { keyId: current.id, payload: Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64") };
    },
    decrypt<T = unknown>(rowId: string, keyId: string, payload: string): T {
      const k = all.find((x) => x.id === keyId);
      if (!k) throw new Error(`Inquiry key ${keyId} is not configured`);
      const buf = Buffer.from(payload, "base64");
      const d = createDecipheriv("aes-256-gcm", k.key, buf.subarray(0, 12));
      d.setAAD(Buffer.from(rowId));
      d.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as T;
    },
  };
}
