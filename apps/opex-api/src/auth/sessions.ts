import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db, Q } from "../db/index.ts";
import { sha256, token, safeEqual } from "../ids.ts";
import type { Principal } from "./principal.ts";

export const COOKIE = "opex_session";
export const IDLE_MS = 15 * 60_000;
export const ABSOLUTE_MS = 8 * 60 * 60_000;

/**
 * Console sessions. The cookie holds a random 256-bit token; the database stores only its SHA-256,
 * so a database leak does not leak live sessions. CSRF uses a second random token returned to the
 * console and compared (hashed) on every state-changing request.
 */
export async function createSession(q: Q, tenant: string, principalId: string, req: FastifyRequest, mfa: boolean) {
  const raw = token(32);
  const csrf = token(24);
  const id = sha256(raw);
  await q(
    `INSERT INTO sessions (id, tenant_id, principal_id, kind, ip, user_agent, mfa, csrf_hash, expires_at, step_up_at)
     VALUES ($1,$2,$3,'console',$4,$5,$6,$7, clock_timestamp() + interval '8 hours', clock_timestamp())`,
    [id, tenant, principalId, req.info.ip, req.info.user_agent, mfa, sha256(csrf)],
  );
  return { raw, csrf, id };
}

export function setSessionCookie(reply: FastifyReply, raw: string, secure: boolean) {
  reply.setCookie(COOKIE, raw, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: ABSOLUTE_MS / 1000 });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean) {
  reply.clearCookie(COOKIE, { httpOnly: true, secure, sameSite: "strict", path: "/" });
}

type SessionRow = {
  id: string;
  principal_id: string;
  mfa: boolean;
  step_up_at: Date | null;
  csrf_hash: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  kind: string;
  role: string | null;
  display_name: string;
  status: string;
  pkind: Principal["kind"];
};

/** Resolves the console session from the cookie, enforcing idle and absolute timeouts. */
export async function loadConsoleSession(db: Db, tenant: string, req: FastifyRequest): Promise<(Principal & { csrfHash: string }) | null> {
  const raw = req.cookies[COOKIE];
  if (!raw || raw.length > 100) return null;
  const [s] = await db.q<SessionRow>(
    `SELECT s.id, s.principal_id, s.mfa, s.step_up_at, s.csrf_hash, s.last_seen_at, s.expires_at, s.revoked_at, s.kind,
            p.role, p.display_name, p.status, p.kind AS pkind
       FROM sessions s JOIN principals p ON p.id = s.principal_id
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [sha256(raw), tenant],
  );
  if (!s || s.kind !== "console" || s.revoked_at || s.status !== "active" || s.pkind !== "operator") return null;
  const now = Date.now();
  if (new Date(s.expires_at).getTime() < now) return null;
  if (new Date(s.last_seen_at).getTime() + IDLE_MS < now) {
    await db.q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'idle' WHERE id = $1 AND revoked_at IS NULL`, [s.id]);
    return null;
  }
  // Touch at most once a minute.
  if (now - new Date(s.last_seen_at).getTime() > 60_000) await db.q(`UPDATE sessions SET last_seen_at = clock_timestamp() WHERE id = $1`, [s.id]);
  return {
    id: s.principal_id,
    kind: "operator",
    display: s.display_name,
    role: s.role,
    sessionId: s.id,
    mfa: s.mfa,
    stepUpAt: s.step_up_at ? new Date(s.step_up_at) : null,
    clientId: null,
    partnerClientId: null,
    scopes: [],
    authMethod: "password+totp",
    csrfHash: s.csrf_hash,
  };
}

export const csrfMatches = (hashStored: string, provided: string | undefined) => !!provided && provided.length < 100 && safeEqual(hashStored, sha256(provided));
