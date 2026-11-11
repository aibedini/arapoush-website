import { Secret, TOTP } from "otpauth";

const PERIOD = 30;

export function newTotpSecret(label: string, issuer = "OPEX") {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer, label, secret, algorithm: "SHA1", digits: 6, period: PERIOD });
  return { secret: secret.base32, uri: totp.toString() };
}

/**
 * Verifies a code within ±1 step and returns the matched time step, so the caller can reject reuse
 * of the same (or an earlier) step: a code works once.
 */
export function verifyTotp(secretB32: string, code: string, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = new TOTP({ secret: Secret.fromBase32(secretB32), algorithm: "SHA1", digits: 6, period: PERIOD });
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

/** For tests and the CLI: the current code for a secret. */
export const totpNow = (secretB32: string) => new TOTP({ secret: Secret.fromBase32(secretB32), algorithm: "SHA1", digits: 6, period: PERIOD }).generate();
