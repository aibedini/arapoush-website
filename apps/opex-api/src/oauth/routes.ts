import { AuthorizeQuery } from "./contract.ts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify, type JWK } from "jose";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { dummyVerify, verifyPassword } from "../auth/password.ts";
import { newTotpSecret, verifyTotp } from "../auth/totp.ts";
import { ipAllowed } from "../auth/cidr.ts";
import { badRequest, unauthorized } from "../http/problem.ts";
import { sha256, token, ulid } from "../ids.ts";
import { signingKeys } from "./keys.ts";
import { verifyClientAssertion, verifyDpop } from "./proofs.ts";

export { PARTNER_SCOPES } from "./contract.ts";
import { PARTNER_SCOPES } from "./contract.ts";
const ACCESS_TTL = 300;
const REFRESH_TTL_H = 8;

type ClientRow = { id: string; client_id: string; name: string; status: string; allowed_cidrs: string[]; mtls_fingerprint: string | null; jwks: { keys: JWK[] }; redirect_uris: string[]; scopes: string[]; service_principal_id: string | null };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The partner's certificate fingerprint, trusted only when the TLS terminator is a trusted proxy. */
export function clientCertFingerprint(req: FastifyRequest, trusted: string[]): string | null {
  const fromProxy = ipAllowed(req.socket.remoteAddress ?? null, trusted);
  const h = req.headers["x-client-cert-sha256"];
  return fromProxy && typeof h === "string" ? h.toLowerCase().replace(/:/g, "") : null;
}

/**
 * OAuth 2.1 authorization server for AraCMS (ADR 0001): authorization_code + PKCE for AraCMS staff
 * (OPEX-hosted login with mandatory TOTP), client_credentials for machine calls, refresh rotation
 * with reuse detection, DPoP-bound ES256 access tokens (5 min), private_key_jwt client auth,
 * network checks (client CIDRs, mTLS fingerprint) on every token request.
 */
export async function oauthModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const issuer = config.PUBLIC_URL;
  const tokenUrl = `${issuer}/oauth/token`;
  const stageKey = new TextEncoder().encode(config.SESSION_SECRET + ":oauth");

  const loadClient = async (clientId: string) => {
    const [c] = await db.q<ClientRow>(`SELECT * FROM partner_clients WHERE client_id = $1 AND tenant_id = $2`, [clientId, tenant]);
    return c?.status === "active" ? c : null;
  };
  const networkOk = (req: FastifyRequest, c: ClientRow) => ipAllowed(req.info.ip, c.allowed_cidrs) && (!c.mtls_fingerprint || clientCertFingerprint(req, config.trustedProxies) === c.mtls_fingerprint.toLowerCase());

  app.get("/.well-known/jwks.json", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return (await signingKeys(config, { memory: config.NODE_ENV === "test" })).publicJwks;
  });
  app.get("/.well-known/oauth-authorization-server", async () => ({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: tokenUrl,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["private_key_jwt"],
    dpop_signing_alg_values_supported: ["ES256", "EdDSA", "PS256"],
    scopes_supported: PARTNER_SCOPES,
  }));

  // ── Authorization (AraCMS staff sign in here, never in AraCMS) ──
  const AuthQ = AuthorizeQuery;
  type AuthParams = z.infer<typeof AuthQ>;

  const page = (reply: FastifyReply, client: ClientRow, p: AuthParams, body: string, error?: string) => {
    const origin = new URL(p.redirect_uri).origin;
    reply.header("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${origin}; frame-ancestors 'none'; base-uri 'none'`);
    const hidden = Object.entries(p)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`)
      .join("");
    return reply.type("text/html; charset=utf-8").send(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ورود به OPEX</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f8;font:15px/1.7 Tahoma,system-ui,sans-serif;color:#111d2a}form{width:min(92vw,380px);background:#fff;padding:28px;border-radius:18px;box-shadow:0 24px 60px -40px #14467099}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#4a5361}label{display:block;margin:12px 0 4px;font-weight:600}input[type=email],input[type=password],input[type=text]{width:100%;box-sizing:border-box;min-height:44px;padding:8px 12px;border:1px solid #c4cdd6;border-radius:10px;font:inherit}button{margin-top:18px;width:100%;min-height:46px;border:0;border-radius:999px;background:#09263c;color:#fff;font:600 15px inherit;cursor:pointer}.err{background:#fde8e8;color:#8a1c1c;padding:8px 12px;border-radius:10px;margin-bottom:12px}code{direction:ltr;display:block;word-break:break-all;background:#f1f5fa;padding:8px;border-radius:8px}</style></head>
<body><form method="post" action="/oauth/authorize"><h1>ورود به OPEX</h1><p>برای ادامه در «${esc(client.name)}» وارد شوید.</p>${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}${hidden}${body}</form></body></html>`);
  };

  const validClientFor = async (p: AuthParams) => {
    const client = await loadClient(p.client_id);
    // Exact redirect URI match only (no prefix or wildcard matching).
    if (!client || !client.redirect_uris.includes(p.redirect_uri)) return null;
    return client;
  };

  app.get("/oauth/authorize", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = AuthQ.safeParse(req.query);
    if (!parsed.success) throw badRequest("INVALID_REQUEST", "Invalid authorization request");
    const client = await validClientFor(parsed.data);
    if (!client) throw badRequest("INVALID_CLIENT", "Unknown client or redirect URI");
    return page(
      reply,
      client,
      parsed.data,
      `<input type="hidden" name="stage" value="password"><label for="e">ایمیل</label><input id="e" type="email" name="email" autocomplete="username" required dir="ltr"><label for="p">گذرواژه</label><input id="p" type="password" name="password" autocomplete="current-password" required dir="ltr"><button>ادامه</button>`,
    );
  });

  app.post("/oauth/authorize", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const raw = req.body as Record<string, string>;
    const parsed = AuthQ.safeParse(raw);
    if (!parsed.success) throw badRequest("INVALID_REQUEST", "Invalid authorization request");
    const p = parsed.data;
    const client = await validClientFor(p);
    if (!client) throw badRequest("INVALID_CLIENT", "Unknown client or redirect URI");
    const anon = { kind: "anonymous" as const, id: null, via_client: client.client_id };

    if (raw.stage === "password") {
      const email = String(raw.email ?? "").toLowerCase().slice(0, 200);
      const [u] = await db.q<{ id: string; display_name: string; status: string; secret: string | null; partner_client_id: string | null; locked_until: Date | null }>(
        `SELECT p.id, p.display_name, p.status, p.partner_client_id, p.locked_until, c.secret FROM principals p LEFT JOIN credentials c ON c.principal_id = p.id AND c.kind = 'password'
          WHERE p.tenant_id = $1 AND p.email = $2 AND p.kind = 'partner_user'`,
        [tenant, email],
      );
      const ok = u && u.secret && u.status === "active" && u.partner_client_id === client.id && !(u.locked_until && new Date(u.locked_until).getTime() > Date.now()) && (await verifyPassword(u.secret, String(raw.password ?? "")));
      if (!ok) {
        if (!u?.secret) await dummyVerify(String(raw.password ?? ""));
        if (u) await db.q(`UPDATE principals SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN clock_timestamp() + interval '15 minutes' ELSE locked_until END WHERE id = $1`, [u.id]);
        await auditNow(db, tenant, { action: "oauth.login.failure", result: "failure", actor: { ...anon, id: u?.id ?? null, display: email }, request: req.info });
        return page(reply.status(401), client, p, `<input type="hidden" name="stage" value="password"><label for="e">ایمیل</label><input id="e" type="email" name="email" value="${esc(email)}" required dir="ltr"><label for="p">گذرواژه</label><input id="p" type="password" name="password" required dir="ltr"><button>ادامه</button>`, "ایمیل یا گذرواژه نادرست است.");
      }
      const [totp] = await db.q<{ confirmed: boolean }>(`SELECT confirmed FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [u.id]);
      const ch = await new SignJWT({ client: client.client_id }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuedAt().setExpirationTime("5m").sign(stageKey);
      let enroll = "";
      if (!totp?.confirmed) {
        const t = newTotpSecret(email, "OPEX (AraCMS)");
        await db.q(`INSERT INTO credentials (principal_id, kind, secret, confirmed) VALUES ($1,'totp',$2,false) ON CONFLICT (principal_id, kind) DO UPDATE SET secret = EXCLUDED.secret, confirmed = false`, [u.id, t.secret]);
        enroll = `<p>اولین ورود: این کلید را در اپ احراز هویت (Google Authenticator و مانند آن) ثبت کنید.</p><code>${esc(t.secret)}</code><code>${esc(t.uri)}</code>`;
      }
      return page(reply, client, p, `<input type="hidden" name="stage" value="code"><input type="hidden" name="challenge" value="${esc(ch)}">${enroll}<label for="c">کد ۶ رقمی</label><input id="c" type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required dir="ltr"><button>ورود</button>`);
    }

    if (raw.stage === "code") {
      let uid: string;
      try {
        const { payload } = await jwtVerify(String(raw.challenge ?? ""), stageKey, { algorithms: ["HS256"] });
        if (payload.client !== client.client_id || !payload.sub) throw new Error();
        uid = payload.sub;
      } catch {
        throw unauthorized("Sign-in expired; start again");
      }
      const [c] = await db.q<{ secret: string; confirmed: boolean; last_used_step: string | null }>(`SELECT secret, confirmed, last_used_step FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [uid]);
      // S2: the code step counts failures and honours the lock too (no unlimited TOTP guessing).
      const [lk] = await db.q<{ locked_until: Date | null }>(`SELECT locked_until FROM principals WHERE id = $1`, [uid]);
      const locked = !!lk?.locked_until && new Date(lk.locked_until).getTime() > Date.now();
      const step = c && !locked ? verifyTotp(c.secret, String(raw.code ?? ""), c.last_used_step === null ? null : Number(c.last_used_step)) : null;
      if (step === null) {
        if (!locked) await db.q(`UPDATE principals SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN clock_timestamp() + interval '15 minutes' ELSE locked_until END WHERE id = $1`, [uid]);
        await auditNow(db, tenant, { action: "oauth.mfa.failure", result: "failure", actor: { ...anon, id: uid }, request: req.info });
        return page(reply.status(401), client, p, `<input type="hidden" name="stage" value="code"><input type="hidden" name="challenge" value="${esc(String(raw.challenge))}"><label for="c">کد ۶ رقمی</label><input id="c" type="text" name="code" inputmode="numeric" required dir="ltr"><button>ورود</button>`, "کد نادرست است.");
      }
      const scope = p.scope.split(" ").filter((s) => (client.scopes as string[]).includes(s)).join(" ") || "content:read";
      const code = token(32);
      await db.tx(async (q) => {
        await q(`UPDATE credentials SET confirmed = true, last_used_step = $2, last_used_at = clock_timestamp() WHERE principal_id = $1 AND kind = 'totp'`, [uid, step]);
        await q(`UPDATE principals SET failed_logins = 0, locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1`, [uid]);
        await q(`INSERT INTO oauth_codes (code_hash, client_id, principal_id, redirect_uri, code_challenge, scope, ip, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7, clock_timestamp() + interval '60 seconds')`, [sha256(code), client.client_id, uid, p.redirect_uri, p.code_challenge, scope, req.info.ip]);
        await audit(q, tenant, { action: "oauth.login.success", actor: { kind: "partner_user", id: uid, via_client: client.client_id, auth: { method: "password+totp", mfa: true } }, request: req.info, resource: { scope } });
      });
      const to = new URL(p.redirect_uri);
      to.searchParams.set("code", code);
      if (p.state) to.searchParams.set("state", p.state);
      to.searchParams.set("iss", issuer);
      return reply.redirect(to.toString(), 303);
    }
    throw badRequest("INVALID_REQUEST", "Unknown stage");
  });

  // ── Token endpoint ──
  const issue = async (q: Parameters<Parameters<typeof db.tx>[0]>[0], o: { principalId: string; kind: "partner_user" | "service"; client: ClientRow; scope: string; jkt: string; sessionId?: string; family?: string; refresh: boolean; ip: string | null; ua: string | null }) => {
    const keys = await signingKeys(config, { memory: config.NODE_ENV === "test" });
    let sessionId = o.sessionId;
    if (!sessionId) {
      sessionId = ulid("ses_");
      await q(`INSERT INTO sessions (id, tenant_id, principal_id, kind, client_id, ip, user_agent, mfa, expires_at) VALUES ($1,$2,$3,'oauth',$4,$5,$6,$7, clock_timestamp() + make_interval(hours => $8::int))`, [sessionId, tenant, o.principalId, o.client.client_id, o.ip, o.ua, o.kind === "partner_user", REFRESH_TTL_H]);
    }
    const jti = ulid("jti_");
    const access = await new SignJWT({ scope: o.scope, azp: o.client.client_id, sid: sessionId, kind: o.kind, cnf: { jkt: o.jkt } })
      .setProtectedHeader({ alg: "ES256", kid: keys.kid, typ: "at+jwt" })
      .setIssuer(issuer)
      .setSubject(o.principalId)
      .setAudience("opex-partner")
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL}s`)
      .sign(keys.privateKey);
    let refresh: string | undefined;
    if (o.refresh) {
      refresh = token(32);
      await q(`INSERT INTO refresh_tokens (token_hash, session_id, family, dpop_jkt, expires_at) VALUES ($1,$2,$3,$4, clock_timestamp() + make_interval(hours => $5::int))`, [sha256(refresh), sessionId, o.family ?? ulid("fam_"), o.jkt, REFRESH_TTL_H]);
    }
    return { access_token: access, token_type: "DPoP", expires_in: ACCESS_TTL, scope: o.scope, ...(refresh ? { refresh_token: refresh } : {}) };
  };

  app.post("/oauth/token", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>;
    const clientId = String(b.client_id ?? "");
    const client = await loadClient(clientId);
    const actor = { kind: "service" as const, id: client?.service_principal_id ?? null, via_client: clientId };
    const reject = async (reason: string, code = "invalid_grant") => {
      await auditNow(db, tenant, { action: "oauth.token.failure", result: "failure", actor, request: req.info, reason });
      return reply.status(400).send({ error: code, error_description: reason });
    };
    if (!client) return reject("unknown client", "invalid_client");
    if (!networkOk(req, client)) {
      await auditNow(db, tenant, { action: "authz.denied", result: "denied", actor, request: req.info, resource: { rule: "partner.network" }, reason: "IP or client certificate not allowed" });
      return reply.status(403).send({ error: "access_denied", error_description: "Network not allowed for this client" });
    }
    if (b.client_assertion_type !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer") return reject("private_key_jwt required", "invalid_client");
    try {
      await db.tx((q) => verifyClientAssertion(q, b.client_assertion, client, [tokenUrl, issuer]));
    } catch {
      return reject("client authentication failed", "invalid_client");
    }
    let jkt: string;
    try {
      jkt = await db.tx((q) => verifyDpop(q, req.headers.dpop as string | undefined, { method: "POST", url: tokenUrl }));
    } catch (e) {
      return reject((e as Error).message, "invalid_dpop_proof");
    }
    const ua = req.info.user_agent ?? null;

    if (b.grant_type === "authorization_code") {
      const codeHash = sha256(String(b.code ?? ""));
      const result = await db.tx(async (q) => {
        const [c] = await q<{ client_id: string; principal_id: string; redirect_uri: string; code_challenge: string; scope: string; expires_at: Date; used_at: Date | null }>(`SELECT * FROM oauth_codes WHERE code_hash = $1 FOR UPDATE`, [codeHash]);
        if (!c || c.used_at || new Date(c.expires_at).getTime() < Date.now() || c.client_id !== client.client_id || c.redirect_uri !== b.redirect_uri) return null;
        const challenge = createHash("sha256").update(String(b.code_verifier ?? "")).digest("base64url");
        if (challenge !== c.code_challenge) return null;
        await q(`UPDATE oauth_codes SET used_at = clock_timestamp() WHERE code_hash = $1`, [codeHash]);
        const t = await issue(q, { principalId: c.principal_id, kind: "partner_user", client, scope: c.scope, jkt, refresh: true, ip: req.info.ip, ua });
        await audit(q, tenant, { action: "oauth.token.issued", actor: { kind: "partner_user", id: c.principal_id, via_client: client.client_id }, request: req.info, resource: { grant: "authorization_code", scope: c.scope } });
        return t;
      });
      return result ?? reject("invalid, expired or reused code / PKCE mismatch");
    }

    if (b.grant_type === "refresh_token") {
      const h = sha256(String(b.refresh_token ?? ""));
      const result = await db.tx(async (q) => {
        const [r] = await q<{ session_id: string; family: string; dpop_jkt: string | null; expires_at: Date; used_at: Date | null; revoked_at: Date | null; principal_id: string; kind: string; client_id: string; srevoked: Date | null; status: string }>(
          `SELECT r.*, s.principal_id, s.client_id, s.revoked_at AS srevoked, p.kind, p.status FROM refresh_tokens r JOIN sessions s ON s.id = r.session_id JOIN principals p ON p.id = s.principal_id WHERE r.token_hash = $1 FOR UPDATE OF r`,
          [h],
        );
        if (!r) return { error: "unknown refresh token" };
        if (r.used_at || r.revoked_at) {
          // Reuse of a rotated token: assume theft, end the whole family and the session.
          await q(`UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE family = $1 AND revoked_at IS NULL`, [r.family]);
          await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'refresh_reuse' WHERE id = $1`, [r.session_id]);
          await audit(q, tenant, { action: "oauth.refresh.reuse_detected", result: "denied", actor: { kind: r.kind as "partner_user", id: r.principal_id, via_client: r.client_id, session_id: r.session_id }, request: req.info, reason: "Rotated refresh token presented again; session revoked" });
          return { error: "refresh token reuse detected; session revoked" };
        }
        if (r.client_id !== client.client_id || r.srevoked || r.status !== "active" || new Date(r.expires_at).getTime() < Date.now()) return { error: "refresh token no longer valid" };
        if (r.dpop_jkt && r.dpop_jkt !== jkt) return { error: "refresh token bound to another key" };
        await q(`UPDATE refresh_tokens SET used_at = clock_timestamp() WHERE token_hash = $1`, [h]);
        const [orig] = await q<{ scope: string }>(`SELECT scope FROM oauth_codes WHERE principal_id = $1 AND client_id = $2 ORDER BY expires_at DESC LIMIT 1`, [r.principal_id, r.client_id]);
        const t = await issue(q, { principalId: r.principal_id, kind: "partner_user", client, scope: (orig?.scope ?? "content:read").split(" ").filter((x) => (client.scopes as string[]).includes(x)).join(" ") || "content:read", jkt, sessionId: r.session_id, family: r.family, refresh: true, ip: req.info.ip, ua });
        await audit(q, tenant, { action: "oauth.token.refreshed", actor: { kind: "partner_user", id: r.principal_id, via_client: r.client_id, session_id: r.session_id }, request: req.info });
        return { token: t };
      });
      return "token" in result ? result.token : reject(result.error!);
    }

    if (b.grant_type === "client_credentials") {
      if (!client.service_principal_id) return reject("client has no service identity", "unauthorized_client");
      const scope = String(b.scope ?? "content:read").split(" ").filter((s) => client.scopes.includes(s)).join(" ") || "content:read";
      return db.tx(async (q) => {
        const t = await issue(q, { principalId: client.service_principal_id!, kind: "service", client, scope, jkt, refresh: false, ip: req.info.ip, ua });
        await audit(q, tenant, { action: "oauth.token.issued", actor, request: req.info, resource: { grant: "client_credentials", scope } });
        return t;
      });
    }
    return reject("unsupported grant_type", "unsupported_grant_type");
  });

  app.post("/oauth/revoke", async (req) => {
    const b = (req.body ?? {}) as Record<string, string>;
    const client = await loadClient(String(b.client_id ?? ""));
    if (!client) return {};
    await db.tx(async (q) => {
      await verifyClientAssertion(q, b.client_assertion, client, [`${issuer}/oauth/revoke`, issuer]);
      const [r] = await q<{ session_id: string; family: string }>(`SELECT session_id, family FROM refresh_tokens WHERE token_hash = $1`, [sha256(String(b.token ?? ""))]);
      if (r) {
        await q(`UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE family = $1 AND revoked_at IS NULL`, [r.family]);
        await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'client_revoked' WHERE id = $1`, [r.session_id]);
        await audit(q, tenant, { action: "oauth.token.revoked", actor: { kind: "service", id: client.service_principal_id, via_client: client.client_id }, request: req.info, resource: { session: r.session_id } });
      }
    });
    return {};
  });
}
