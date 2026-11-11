import { AUTH, LoginBody, MfaBody, NewOperatorBody, OperatorPatch } from "./contract.ts";
import type { FastifyInstance } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../http/problem.ts";
import { sha256, token, ulid } from "../ids.ts";
import { requireOperator, requireStepUp } from "./guards.ts";
import { checkPasswordPolicy, dummyVerify, hashPassword, verifyPassword } from "./password.ts";
import { actorOf } from "./principal.ts";
import { clearSessionCookie, createSession, setSessionCookie } from "./sessions.ts";
import { newTotpSecret, verifyTotp } from "./totp.ts";

const LOCK_AFTER = 5;
const Login = LoginBody;
const Mfa = MfaBody;

type PrincipalRow = { id: string; email: string; display_name: string; status: string; role: string | null; kind: string; failed_logins: number; locked_until: Date | null; secret: string | null };

/** Operator sign-in (password, then TOTP), session management and operator administration. */
export async function authModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const key = new TextEncoder().encode(config.SESSION_SECRET);
  const secure = config.isProd;

  const challenge = (sub: string, purpose: "mfa") => new SignJWT({ purpose }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("5m").setAudience("opex-console").sign(key);
  const readChallenge = async (jwt: string) => {
    try {
      const { payload } = await jwtVerify(jwt, key, { audience: "opex-console", algorithms: ["HS256"] });
      if (payload.purpose !== "mfa" || !payload.sub) throw new Error();
      return payload.sub;
    } catch {
      throw unauthorized("Sign-in expired; start again");
    }
  };

  // ── Sign in ──
  app.post("/v1/manage/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const body = Login.parse(req.body);
    const email = body.email.toLowerCase();
    const [p] = await db.q<PrincipalRow>(
      `SELECT p.id, p.email, p.display_name, p.status, p.role, p.kind, p.failed_logins, p.locked_until, c.secret
         FROM principals p LEFT JOIN credentials c ON c.principal_id = p.id AND c.kind = 'password'
        WHERE p.tenant_id = $1 AND p.email = $2 AND p.kind = 'operator'`,
      [tenant, email],
    );
    const fail = async (reason: string) => {
      await auditNow(db, tenant, { action: "auth.login.failure", result: "failure", actor: { kind: "anonymous", id: p?.id ?? null, display: email }, request: req.info, reason });
      return unauthorized("Email or password is incorrect");
    };
    if (!p || !p.secret) {
      await dummyVerify(body.password);
      throw await fail(p ? "no password set" : "unknown email");
    }
    if (p.locked_until && new Date(p.locked_until).getTime() > Date.now()) throw await fail("account locked");
    if (p.status !== "active") throw await fail(`status ${p.status}`);
    if (!(await verifyPassword(p.secret, body.password))) {
      const n = p.failed_logins + 1;
      // Exponential lockout after LOCK_AFTER failures: 15, 30, 60 … minutes (capped at 24 h).
      const lockMin = n >= LOCK_AFTER ? Math.min(15 * 2 ** (n - LOCK_AFTER), 1440) : 0;
      await db.q(`UPDATE principals SET failed_logins = $2, locked_until = CASE WHEN $3::int > 0 THEN clock_timestamp() + make_interval(mins => $3::int) ELSE locked_until END WHERE id = $1`, [p.id, n, lockMin]);
      if (lockMin) await auditNow(db, tenant, { action: "auth.lockout", result: "failure", actor: { kind: "operator", id: p.id, display: p.display_name }, request: req.info, reason: `${n} failed attempts; locked ${lockMin} min` });
      throw await fail("wrong password");
    }
    const [totp] = await db.q<{ confirmed: boolean }>(`SELECT confirmed FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [p.id]);
    await auditNow(db, tenant, { action: "auth.password.ok", actor: { kind: "operator", id: p.id, display: p.display_name }, request: req.info });
    return { mfa: totp?.confirmed ? "totp" : "enroll", challenge: await challenge(p.id, "mfa") };
  });

  // First sign-in: create a TOTP secret (shown once) for the authenticator app.
  app.post("/v1/manage/auth/mfa/enroll", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { challenge: c } = AUTH.enroll.body.parse(req.body);
    const id = await readChallenge(c);
    const [existing] = await db.q<{ confirmed: boolean }>(`SELECT confirmed FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [id]);
    if (existing?.confirmed) throw conflict("MFA_ENROLLED", "An authenticator is already set up");
    const [p] = await db.q<{ email: string }>(`SELECT email FROM principals WHERE id = $1`, [id]);
    const t = newTotpSecret(p!.email);
    await db.tx(async (q) => {
      await q(`INSERT INTO credentials (principal_id, kind, secret, confirmed) VALUES ($1,'totp',$2,false) ON CONFLICT (principal_id, kind) DO UPDATE SET secret = EXCLUDED.secret, confirmed = false`, [id, t.secret]);
      await audit(q, tenant, { action: "auth.mfa.enroll_started", actor: { kind: "operator", id }, request: req.info });
    });
    return { secret: t.secret, uri: t.uri };
  });

  app.post("/v1/manage/auth/mfa", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = Mfa.parse(req.body);
    const id = await readChallenge(body.challenge);
    const [c] = await db.q<{ secret: string; confirmed: boolean; last_used_step: string | null }>(`SELECT secret, confirmed, last_used_step FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [id]);
    const step = c ? verifyTotp(c.secret, body.code, c.last_used_step === null ? null : Number(c.last_used_step)) : null;
    if (!c || step === null) {
      await auditNow(db, tenant, { action: "auth.mfa.failure", result: "failure", actor: { kind: "operator", id }, request: req.info });
      await db.q(`UPDATE principals SET failed_logins = failed_logins + 1 WHERE id = $1`, [id]);
      throw unauthorized("The code is not valid");
    }
    const [p] = await db.q<{ display_name: string; role: string; status: string }>(`SELECT display_name, role, status FROM principals WHERE id = $1`, [id]);
    if (p?.status !== "active") throw unauthorized();
    const s = await db.tx(async (q) => {
      await q(`UPDATE credentials SET confirmed = true, last_used_step = $2, last_used_at = clock_timestamp() WHERE principal_id = $1 AND kind = 'totp'`, [id, step]);
      await q(`UPDATE principals SET failed_logins = 0, locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1`, [id]);
      const s = await createSession(q, tenant, id, req, true);
      await audit(q, tenant, {
        action: c.confirmed ? "auth.login.success" : "auth.mfa.enrolled",
        actor: { kind: "operator", id, display: p.display_name, roles: [p.role], session_id: s.id, auth: { method: "password+totp", mfa: true } },
        request: req.info,
      });
      return s;
    });
    setSessionCookie(reply, s.raw, secure);
    return { csrf: s.csrf, me: { id, display: p.display_name, role: p.role } };
  });

  // Step-up: re-confirm the authenticator before sensitive actions.
  app.post("/v1/manage/auth/step-up", { preHandler: requireOperator(deps), config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { code } = AUTH.stepUp.body.parse(req.body);
    const me = req.principal!;
    const [c] = await db.q<{ secret: string; last_used_step: string | null }>(`SELECT secret, last_used_step FROM credentials WHERE principal_id = $1 AND kind = 'totp' AND confirmed`, [me.id]);
    const step = c ? verifyTotp(c.secret, code, c.last_used_step === null ? null : Number(c.last_used_step)) : null;
    if (step === null) {
      await auditNow(db, tenant, { action: "auth.step_up.failure", result: "failure", actor: actorOf(req), request: req.info });
      throw unauthorized("The code is not valid");
    }
    await db.tx(async (q) => {
      await q(`UPDATE credentials SET last_used_step = $2, last_used_at = clock_timestamp() WHERE principal_id = $1 AND kind = 'totp'`, [me.id, step]);
      await q(`UPDATE sessions SET step_up_at = clock_timestamp() WHERE id = $1`, [me.sessionId]);
      await audit(q, tenant, { action: "auth.step_up", actor: actorOf(req), request: req.info });
    });
    return { ok: true, validForSeconds: 300 };
  });

  app.get("/v1/manage/auth/me", { preHandler: requireOperator(deps) }, async (req) => {
    const p = req.principal!;
    return { id: p.id, display: p.display, role: p.role, stepUpValid: !!p.stepUpAt && Date.now() - p.stepUpAt.getTime() < 300_000 };
  });

  // The console keeps the CSRF token in memory only; after a reload it fetches a fresh one.
  // Safe as a GET: the session cookie is SameSite=Strict and CORS stops other origins reading it.
  app.get("/v1/manage/auth/csrf", { preHandler: requireOperator(deps) }, async (req, reply) => {
    const csrf = token(24);
    await db.q(`UPDATE sessions SET csrf_hash = $2 WHERE id = $1`, [req.principal!.sessionId, sha256(csrf)]);
    reply.header("Cache-Control", "no-store");
    return { csrf };
  });

  app.post("/v1/manage/auth/logout", { preHandler: requireOperator(deps) }, async (req, reply) => {
    await db.tx(async (q) => {
      await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'logout' WHERE id = $1`, [req.principal!.sessionId]);
      await audit(q, tenant, { action: "auth.logout", actor: actorOf(req), request: req.info });
    });
    clearSessionCookie(reply, secure);
    return { ok: true };
  });

  app.post("/v1/manage/auth/password", { preHandler: [requireOperator(deps), requireStepUp(deps)] }, async (req) => {
    const body = AUTH.password.body.parse(req.body);
    const me = req.principal!;
    const [row] = await db.q<{ secret: string; email: string }>(`SELECT c.secret, p.email FROM credentials c JOIN principals p ON p.id = c.principal_id WHERE c.principal_id = $1 AND c.kind = 'password'`, [me.id]);
    if (!row || !(await verifyPassword(row.secret, body.current))) throw unauthorized("Current password is incorrect");
    const policy = await checkPasswordPolicy(body.next, { email: row.email, online: config.isProd });
    if (policy) throw badRequest("WEAK_PASSWORD", policy);
    const h = await hashPassword(body.next);
    await db.tx(async (q) => {
      await q(`UPDATE credentials SET secret = $2, created_at = clock_timestamp() WHERE principal_id = $1 AND kind = 'password'`, [me.id, h]);
      // Every other session of this operator ends.
      await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'password_changed' WHERE principal_id = $1 AND id <> $2 AND revoked_at IS NULL`, [me.id, me.sessionId]);
      await audit(q, tenant, { action: "auth.password.changed", actor: actorOf(req), request: req.info });
    });
    return { ok: true };
  });

  // ── Sessions ──
  app.get("/v1/manage/sessions", { preHandler: requireOperator(deps) }, async (req) => {
    const all = req.principal!.role === "super_admin" && AUTH.sessions.query.parse(req.query).all === "1";
    return db.q(
      `SELECT s.id, s.kind, s.ip, s.user_agent, s.created_at, s.last_seen_at, s.expires_at, s.client_id, p.display_name, p.kind AS principal_kind
         FROM sessions s JOIN principals p ON p.id = s.principal_id
        WHERE s.tenant_id = $1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp() ${all ? "" : "AND s.principal_id = $2"}
        ORDER BY s.last_seen_at DESC LIMIT 200`,
      all ? [tenant] : [tenant, req.principal!.id],
    );
  });

  app.post("/v1/manage/sessions/:id/revoke", { preHandler: requireOperator(deps) }, async (req) => {
    const { id } = req.params as { id: string };
    const me = req.principal!;
    const [s] = await db.q<{ principal_id: string }>(`SELECT principal_id FROM sessions WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!s) throw notFound("Session");
    if (s.principal_id !== me.id && me.role !== "super_admin") throw forbidden();
    await db.tx(async (q) => {
      await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'revoked_by_operator' WHERE id = $1 AND revoked_at IS NULL`, [id]);
      await q(`UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE session_id = $1 AND revoked_at IS NULL`, [id]);
      await audit(q, tenant, { action: "session.revoke", actor: actorOf(req), request: req.info, resource: { type: "session", id, principal: s.principal_id } });
    });
    return { ok: true };
  });

  // ── Operators (super admin) ──
  const NewOperator = NewOperatorBody;
  app.get("/v1/manage/operators", { preHandler: requireOperator(deps, "operator") }, async () =>
    db.q(
      `SELECT p.id, p.email, p.display_name, p.role, p.status, p.last_login_at, p.locked_until, p.created_at,
              EXISTS (SELECT 1 FROM credentials c WHERE c.principal_id = p.id AND c.kind = 'totp' AND c.confirmed) AS mfa
         FROM principals p WHERE p.tenant_id = $1 AND p.kind = 'operator' ORDER BY p.created_at`,
      [tenant],
    ),
  );

  app.post("/v1/manage/operators", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const body = NewOperator.parse(req.body);
    const policy = await checkPasswordPolicy(body.password, { email: body.email, online: config.isProd });
    if (policy) throw badRequest("WEAK_PASSWORD", policy);
    const id = ulid("prn_");
    const h = await hashPassword(body.password);
    await db.tx(async (q) => {
      const [dup] = await q(`SELECT 1 FROM principals WHERE tenant_id = $1 AND email = $2`, [tenant, body.email.toLowerCase()]);
      if (dup) throw conflict("EMAIL_TAKEN", "An account with this email exists");
      await q(`INSERT INTO principals (id, tenant_id, kind, email, display_name, role, created_by) VALUES ($1,$2,'operator',$3,$4,$5,$6)`, [id, tenant, body.email.toLowerCase(), body.display_name, body.role, req.principal!.id]);
      await q(`INSERT INTO credentials (principal_id, kind, secret, confirmed) VALUES ($1,'password',$2,true)`, [id, h]);
      await audit(q, tenant, { action: "operator.create", actor: actorOf(req), request: req.info, resource: { type: "principal", id, email: body.email, role: body.role } });
    });
    return { id };
  });

  app.patch("/v1/manage/operators/:id", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = OperatorPatch.parse(req.body);
    if (id === req.principal!.id && (body.role || body.status)) throw forbidden("SELF_CHANGE", "You cannot change your own role or status");
    const [before] = await db.q<Record<string, unknown>>(`SELECT role, status, display_name FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'operator'`, [id, tenant]);
    if (!before) throw notFound("Operator");
    await db.tx(async (q) => {
      if (body.role) await q(`UPDATE principals SET role = $2 WHERE id = $1`, [id, body.role]);
      if (body.display_name) await q(`UPDATE principals SET display_name = $2 WHERE id = $1`, [id, body.display_name]);
      if (body.status) {
        await q(`UPDATE principals SET status = $2 WHERE id = $1`, [id, body.status]);
        if (body.status === "disabled") await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'disabled' WHERE principal_id = $1 AND revoked_at IS NULL`, [id]);
      }
      if (body.reset_mfa) await q(`DELETE FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [id]);
      if (body.unlock) await q(`UPDATE principals SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [id]);
      const changes = Object.entries(body).map(([k, v]) => ({ op: "replace", path: `/${k}`, old: (before as Record<string, unknown>)[k] ?? null, new: v }));
      await audit(q, tenant, { action: "operator.update", actor: actorOf(req), request: req.info, resource: { type: "principal", id }, changes });
    });
    return { ok: true };
  });
}

/** Bootstrap: the first super admin (CLI only; afterwards operators are created in the console). */
export async function createOperator(deps: Deps, email: string, displayName: string, role: string, password: string) {
  const policy = await checkPasswordPolicy(password, { email });
  if (policy) throw new Error(policy);
  const id = ulid("prn_");
  const h = await hashPassword(password);
  await deps.db.tx(async (q) => {
    await q(`INSERT INTO principals (id, tenant_id, kind, email, display_name, role, created_by) VALUES ($1,$2,'operator',$3,$4,$5,'cli')`, [id, deps.config.TENANT, email.toLowerCase(), displayName, role]);
    await q(`INSERT INTO credentials (principal_id, kind, secret, confirmed) VALUES ($1,'password',$2,true)`, [id, h]);
    await audit(q, deps.config.TENANT, { action: "operator.create", actor: { kind: "system", id: "cli" }, request: { id: "cli", ip: null }, resource: { type: "principal", id, email, role } });
  });
  return id;
}
