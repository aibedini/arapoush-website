import { createHmac, timingSafeEqual } from "node:crypto";

/** Max clock difference accepted on an OPEX webhook, in seconds. */
export const TOLERANCE_S = 300;

/**
 * Verifies `OPEX-Signature: t=<unix>, v1=<hex HMAC-SHA256(secret, t + "." + body)>` and the timestamp.
 * Constant-time comparison; malformed, stale or future-dated signatures are rejected.
 */
export function verifySignature(secret: string, header: string | null, body: string, nowMs = Date.now()): boolean {
  const m = /^t=(\d{1,12}),\s*v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!m) return false;
  const ts = Number(m[1]);
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(m[2]!, "hex"));
}

/** Remembers event ids for twice the tolerance window, so a captured webhook cannot be replayed. */
export function replayCache(ttlMs = TOLERANCE_S * 2000) {
  const seen = new Map<string, number>();
  return (id: string, nowMs = Date.now()) => {
    for (const [k, exp] of seen) if (exp < nowMs) seen.delete(k);
    if (seen.has(id)) return false;
    seen.set(id, nowMs + ttlMs);
    return true;
  };
}
