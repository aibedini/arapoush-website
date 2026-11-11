import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastTime = 0;
let lastRand = new Uint8Array(10);

/** ULID: 48-bit time + 80-bit randomness, monotonic within a millisecond; sorts by creation. */
export function ulid(prefix = ""): string {
  const now = Date.now();
  if (now === lastTime) {
    for (let i = 9; i >= 0; i--) {
      if (lastRand[i]! < 255) {
        lastRand[i]!++;
        break;
      }
      lastRand[i] = 0;
    }
  } else {
    lastTime = now;
    lastRand = new Uint8Array(randomBytes(10));
  }
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let bits = 0n;
  for (const b of lastRand) bits = (bits << 8n) | BigInt(b);
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand = B32[Number(bits & 31n)] + rand;
    bits >>= 5n;
  }
  return prefix + time + rand;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Canonical JSON: keys sorted at every level, so equal data always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as object)
    .sort()
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}
