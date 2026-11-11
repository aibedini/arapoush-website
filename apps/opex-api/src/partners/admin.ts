import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { checkPasswordPolicy, hashPassword } from "../auth/password.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, conflict, notFound } from "../http/problem.ts";
import { ulid } from "../ids.ts";
import { PARTNER_SCOPES } from "../oauth/routes.ts";

const Cidr = z.string().regex(/^[0-9a-fA-F:.]+\/\d{1,3}$/, "CIDR like 203.0.113.0/24");
const Jwk = z.object({ kty: z.enum(["EC", "OKP", "RSA"]), kid: z.string().max(100).optional(), crv: z.string().optional(), x: z.string().optional(), y: z.string().optional(), n: z.string().optional(), e: z.string().optional(), alg: z.string().optional(), use: z.string().optional() }).refine((k) => !("d" in k), "Public keys only");
const ClientBody = z.strictObject({
  name: z.string().min(2).max(120),
  allowed_cidrs: z.array(Cidr).max(50),
  mtls_fingerprint: z.string().regex(/^[0-9a-fA-F:]{64,95}$/).nullable().optional(),
  jwks: z.object({ keys: z.array(Jwk).min(1).max(5) }),
  redirect_uris: z.array(z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "https only")).max(10),
  scopes: z.array(z.enum(PARTNER_SCOPES)).min(1),
  contact: z.string().max(200).optional(),
});
const UserBody = z.strictObject({ email: z.string().email().max(200), display_name: z.string().min(2).max(120), role: z.string().regex(/^[a-z0-9_]{2,40}$/), password: z.string().max(200) });

/** Operators manage AraCMS (and future partners): clients, their users and keys. */
export async function partnerAdminModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const admin = [requireOperator(deps, "super_admin"), requireStepUp(deps)];

  app.get("/v1/manage/partners", { preHandler: requireOperator(deps, "operator") }, async () =>
    db.q(
      `SELECT c.id, c.client_id, c.name, c.status, c.allowed_cidrs, c.mtls_fingerprint, c.redirect_uris, c.scopes, c.contact, c.created_at, jsonb_array_length(c.jwks->'keys') AS keys,
              (SELECT count(*)::int FROM principals p WHERE p.partner_client_id = c.id AND p.kind = 'partner_user') AS users
         FROM partner_clients c WHERE c.tenant_id = $1 ORDER BY c.created_at`,
      [tenant],
    ),
  );

  app.post("/v1/manage/partners", { preHandler: admin }, async (req) => {
    const b = ClientBody.parse(req.body);
    const id = ulid("pcl_");
    const clientId = `aracms_${ulid().toLowerCase().slice(-12)}`;
    const svc = ulid("prn_");
    await db.tx(async (q) => {
      await q(`INSERT INTO principals (id, tenant_id, kind, display_name, role, created_by, mfa_required) VALUES ($1,$2,'service',$3,'service',$4,false)`, [svc, tenant, `${b.name} (service)`, req.principal!.id]);
      await q(
        `INSERT INTO partner_clients (id, tenant_id, name, client_id, allowed_cidrs, mtls_fingerprint, jwks, redirect_uris, scopes, contact, service_principal_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, tenant, b.name, clientId, b.allowed_cidrs, b.mtls_fingerprint ?? null, JSON.stringify(b.jwks), b.redirect_uris, b.scopes, b.contact ?? null, svc, req.principal!.id],
      );
      await q(`UPDATE principals SET partner_client_id = $2 WHERE id = $1`, [svc, id]);
      await audit(q, tenant, { action: "partner.create", actor: actorOf(req), request: req.info, resource: { type: "partner_client", id, client_id: clientId, name: b.name, scopes: b.scopes, cidrs: b.allowed_cidrs } });
    });
    return { id, client_id: clientId };
  });

  app.patch("/v1/manage/partners/:id", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    const b = ClientBody.partial().extend({ status: z.enum(["active", "disabled"]).optional() }).strict().parse(req.body);
    const [before] = await db.q<Record<string, unknown>>(`SELECT * FROM partner_clients WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!before) throw notFound("Partner");
    const cols: Record<string, unknown> = { ...b };
    if (b.jwks) cols.jwks = JSON.stringify(b.jwks);
    const keys = Object.keys(cols);
    if (!keys.length) throw badRequest("NOTHING_TO_CHANGE", "No fields given");
    await db.tx(async (q) => {
      await q(`UPDATE partner_clients SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...keys.map((k) => cols[k])]);
      if (b.status === "disabled" || b.jwks) {
        // Key rotation or disabling ends every live session of this partner.
        await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = $2 WHERE client_id = $1 AND revoked_at IS NULL`, [before.client_id, b.status === "disabled" ? "partner_disabled" : "keys_rotated"]);
      }
      const changes = keys.map((k) => ({ op: "replace", path: `/${k}`, old: k === "jwks" ? "(keys)" : (before[k] ?? null), new: k === "jwks" ? "(keys)" : cols[k] }));
      await audit(q, tenant, { action: b.jwks ? "partner.keys_rotated" : "partner.update", actor: actorOf(req), request: req.info, resource: { type: "partner_client", id }, changes });
    });
    return { ok: true };
  });

  app.get("/v1/manage/partners/:id/users", { preHandler: requireOperator(deps, "operator") }, async (req) =>
    db.q(
      `SELECT p.id, p.email, p.display_name, p.role, p.status, p.last_login_at, p.locked_until, p.created_at,
              EXISTS (SELECT 1 FROM credentials c WHERE c.principal_id = p.id AND c.kind = 'totp' AND c.confirmed) AS mfa
         FROM principals p WHERE p.partner_client_id = $1 AND p.kind = 'partner_user' ORDER BY p.created_at`,
      [(req.params as { id: string }).id],
    ),
  );

  app.post("/v1/manage/partners/:id/users", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    const b = UserBody.parse(req.body);
    const policy = await checkPasswordPolicy(b.password, { email: b.email, online: config.isProd });
    if (policy) throw badRequest("WEAK_PASSWORD", policy);
    const [client] = await db.q(`SELECT 1 FROM partner_clients WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!client) throw notFound("Partner");
    const uid = ulid("prn_");
    const h = await hashPassword(b.password);
    await db.tx(async (q) => {
      const [dup] = await q(`SELECT 1 FROM principals WHERE tenant_id = $1 AND email = $2`, [tenant, b.email.toLowerCase()]);
      if (dup) throw conflict("EMAIL_TAKEN", "An account with this email exists");
      await q(`INSERT INTO principals (id, tenant_id, kind, email, display_name, role, partner_client_id, created_by) VALUES ($1,$2,'partner_user',$3,$4,$5,$6,$7)`, [uid, tenant, b.email.toLowerCase(), b.display_name, b.role, id, req.principal!.id]);
      await q(`INSERT INTO credentials (principal_id, kind, secret, confirmed) VALUES ($1,'password',$2,true)`, [uid, h]);
      await audit(q, tenant, { action: "partner_user.create", actor: actorOf(req), request: req.info, resource: { type: "principal", id: uid, partner: id, email: b.email, role: b.role } });
    });
    return { id: uid };
  });

  app.patch("/v1/manage/partner-users/:uid", { preHandler: admin }, async (req) => {
    const { uid } = req.params as { uid: string };
    const b = z.strictObject({ role: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(), status: z.enum(["active", "disabled"]).optional(), reset_mfa: z.boolean().optional(), unlock: z.boolean().optional() }).parse(req.body);
    const [before] = await db.q<Record<string, unknown>>(`SELECT role, status FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'partner_user'`, [uid, tenant]);
    if (!before) throw notFound("User");
    await db.tx(async (q) => {
      if (b.role) await q(`UPDATE principals SET role = $2 WHERE id = $1`, [uid, b.role]);
      if (b.status) await q(`UPDATE principals SET status = $2 WHERE id = $1`, [uid, b.status]);
      if (b.status === "disabled" || b.reset_mfa) await q(`UPDATE sessions SET revoked_at = clock_timestamp(), revoke_reason = 'user_changed' WHERE principal_id = $1 AND revoked_at IS NULL`, [uid]);
      if (b.reset_mfa) await q(`DELETE FROM credentials WHERE principal_id = $1 AND kind = 'totp'`, [uid]);
      if (b.unlock) await q(`UPDATE principals SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [uid]);
      await audit(q, tenant, { action: "partner_user.update", actor: actorOf(req), request: req.info, resource: { type: "principal", id: uid }, changes: Object.entries(b).map(([k, v]) => ({ op: "replace", path: `/${k}`, old: before[k] ?? null, new: v })) });
    });
    return { ok: true };
  });
}
