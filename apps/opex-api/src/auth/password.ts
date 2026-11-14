import { hash, verify } from "@node-rs/argon2";
import { createHash, randomInt } from "node:crypto";

/** A temporary password: 16 characters from an unambiguous alphabet (80 bits), grouped for reading aloud. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generatePassword() {
  const c = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12)}`;
}

// Argon2id, m=64 MiB, t=3, p=1 (plan §3.2).
const OPTS = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = async (stored: string, pw: string) => {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
};

/** A real hash to verify against when the account doesn't exist, so timing doesn't reveal it. */
let dummy: string | null = null;
export const dummyVerify = async (pw: string) => {
  dummy ??= await hashPassword("dummy-password-for-timing-only");
  await verifyPassword(dummy, pw);
  return false;
};

/**
 * Password policy: 12–128 characters, not the email, not in the breached-password corpus (Have I
 * Been Pwned range API: only the first 5 hex chars of the SHA-1 leave the server).
 */
export async function checkPasswordPolicy(pw: string, opts: { email?: string; online?: boolean } = {}): Promise<string | null> {
  if (pw.length < 12) return "At least 12 characters";
  if (pw.length > 128) return "At most 128 characters";
  if (opts.email && pw.toLowerCase().includes(opts.email.split("@")[0]!.toLowerCase())) return "Must not contain your email name";
  if (opts.online) {
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
      if (res.ok && (await res.text()).split("\n").some((l) => l.startsWith(sha1.slice(5)) && !l.endsWith(":0"))) return "This password appears in known data breaches";
    } catch {
      // Breach check unavailable: policy still enforced by length; failure is not fatal.
    }
  }
  return null;
}
