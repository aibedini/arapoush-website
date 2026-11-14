import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, conflict, forbidden, notFound } from "../http/problem.ts";
import { AUTHZ } from "./contract.ts";
import { BUILTIN_ROLES, PERMISSIONS, PERMISSION_KEYS, ROUTE_PERMISSIONS, effectivePermissions } from "./permissions.ts";

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** S1: the permission catalogue, custom roles and per-operator permissions. */
export async function authzModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const admin = [requireOperator(deps, "super_admin"), requireStepUp(deps)];

  /** Unknown keys are refused; so is giving away anything the caller does not hold itself. */
  const checkGrantable = (req: FastifyRequest, perms: string[]) => {
    const unknown = perms.filter((p) => !PERMISSION_KEYS.has(p));
    if (unknown.length) throw badRequest("UNKNOWN_PERMISSION", `Unknown: ${unknown.slice(0, 10).join(", ")}`);
    const mine = req.principal!.permissions ?? new Set<string>();
    const missing = perms.filter((p) => !mine.has(p));
    if (missing.length) throw forbidden("ESCALATION", "You cannot give permissions you do not have", { missing });
  };

  app.get("/v1/manage/permissions", { preHandler: requireOperator(deps) }, async () => ({
    permissions: PERMISSIONS,
    builtin: Object.entries(BUILTIN_ROLES).map(([key, r]) => ({ key, name: r.name, permissions: r.permissions })),
    routes: ROUTE_PERMISSIONS,
  }));

  app.get("/v1/manage/operators/:id", { preHandler: requireOperator(deps, "operator") }, async (req) => {
    const { id } = AUTHZ.operator.params.parse(req.params);
    type Row = {
      id: string;
      email: string | null;
      display_name: string;
      title: string | null;
      notes: string;
      role: string;
      status: string;
      perm_allow: unknown;
      perm_deny: unknown;
      mfa: boolean;
      last_login_at: Date | null;
      locked_until: Date | null;
      failed_logins: number;
      created_at: Date;
      created_by: string | null;
      must_change_password: boolean;
      access_expires_at: Date | null;
      password_changed_at: Date | null;
    };
    const [p] = await db.q<Row>(
      `SELECT p.id, p.email, p.display_name, p.title, p.notes, p.role, p.status, p.perm_allow, p.perm_deny, p.last_login_at, p.locked_until,
              p.failed_logins, p.created_at, p.must_change_password, p.access_expires_at,
              COALESCE(cb.display_name, p.created_by) AS created_by,
              EXISTS (SELECT 1 FROM credentials c WHERE c.principal_id = p.id AND c.kind = 'totp' AND c.confirmed) AS mfa,
              (SELECT c.created_at FROM credentials c WHERE c.principal_id = p.id AND c.kind = 'password') AS password_changed_at
         FROM principals p LEFT JOIN principals cb ON cb.id = p.created_by
        WHERE p.id = $1 AND p.tenant_id = $2 AND p.kind = 'operator' AND p.deleted_at IS NULL`,
      [id, tenant],
    );
    if (!p) throw notFound("Operator");
    const effectiveSet = await effectivePermissions(db.q, tenant, p);
    const me = req.principal!;
    const mine = me.permissions ?? new Set<string>();
    // Same rule as the write routes (auth/routes.ts `manageable`): the console hides what would be refused.
    const manageable = p.id !== me.id && (p.role !== "super_admin" || me.role === "super_admin") && [...effectiveSet].every((k) => mine.has(k));
    // Where and when someone is signed in is for whoever may end those sessions.
    const sessions = mine.has("sessions.manage") || p.id === me.id
      ? await db.q<{ id: string; ip: string | null; user_agent: string | null; created_at: Date; last_seen_at: Date }>(
          `SELECT id, ip, user_agent, created_at, last_seen_at FROM sessions
            WHERE principal_id = $1 AND kind = 'console' AND revoked_at IS NULL AND expires_at > clock_timestamp() ORDER BY last_seen_at DESC LIMIT 50`,
          [id],
        )
      : [];
    return {
      ...p,
      // The admin note is for those who manage users, not for everyone who may list them.
      notes: mine.has("users.update") ? p.notes : "",
      perm_allow: asList(p.perm_allow),
      perm_deny: asList(p.perm_deny),
      effective: [...effectiveSet].sort(),
      manageable,
      self: p.id === me.id,
      sessions: sessions.map((s) => ({ ...s, id: s.id.slice(0, 12) })),
    };
  });

  app.put("/v1/manage/operators/:id/permissions", { preHandler: admin }, async (req) => {
    const { id } = AUTHZ.setOperatorPermissions.params.parse(req.params);
    const body = AUTHZ.setOperatorPermissions.body.parse(req.body);
    if (id === req.principal!.id) throw forbidden("SELF_CHANGE", "You cannot change your own permissions");
    checkGrantable(req, body.allow);
    const unknown = body.deny.filter((p) => !PERMISSION_KEYS.has(p));
    if (unknown.length) throw badRequest("UNKNOWN_PERMISSION", `Unknown: ${unknown.slice(0, 10).join(", ")}`);
    const allow = [...new Set(body.allow)].sort();
    const deny = [...new Set(body.deny)].filter((p) => !allow.includes(p)).sort();
    await db.tx(async (q) => {
      const [before] = await q<{ role: string | null; perm_allow: unknown; perm_deny: unknown }>(`SELECT role, perm_allow, perm_deny FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'operator' AND deleted_at IS NULL`, [id, tenant]);
      if (!before) throw notFound("Operator");
      // Target protection (as in auth/routes.ts): not on someone who holds more than you.
      const me = req.principal!;
      if (before.role === "super_admin" && me.role !== "super_admin") throw forbidden("ESCALATION", "Only a super admin can manage a super admin");
      const over = [...(await effectivePermissions(q, tenant, before))].filter((p) => !me.permissions?.has(p));
      if (over.length) throw forbidden("ESCALATION", "This operator has permissions you do not have", { missing: over });
      await q(`UPDATE principals SET perm_allow = $2::jsonb, perm_deny = $3::jsonb WHERE id = $1`, [id, JSON.stringify(allow), JSON.stringify(deny)]);
      await audit(q, tenant, {
        action: "operator.permissions",
        actor: actorOf(req),
        request: req.info,
        resource: { type: "principal", id },
        changes: [
          { op: "replace", path: "/perm_allow", old: asList(before.perm_allow), new: allow },
          { op: "replace", path: "/perm_deny", old: asList(before.perm_deny), new: deny },
        ],
      });
    });
    return { ok: true };
  });

  app.get("/v1/manage/roles", { preHandler: requireOperator(deps, "operator") }, async () => {
    const counts = await db.q<{ role: string; n: number }>(`SELECT role, count(*)::int AS n FROM principals WHERE tenant_id = $1 AND kind = 'operator' AND deleted_at IS NULL GROUP BY role`, [tenant]);
    const n = (k: string) => counts.find((c) => c.role === k)?.n ?? 0;
    const custom = await db.q<{ key: string; name: string; description: string; permissions: unknown; updated_at: Date }>(`SELECT key, name, description, permissions, updated_at FROM roles WHERE tenant_id = $1 ORDER BY name`, [tenant]);
    return [
      ...Object.entries(BUILTIN_ROLES).map(([key, r]) => ({ key, name: r.name.en, description: r.name.fa, permissions: r.permissions, builtin: true, members: n(key), updated_at: null })),
      ...custom.map((r) => ({ key: r.key, name: r.name, description: r.description, permissions: asList(r.permissions), builtin: false, members: n(r.key), updated_at: new Date(r.updated_at).toISOString() })),
    ];
  });

  app.post("/v1/manage/roles", { preHandler: admin }, async (req) => {
    const body = AUTHZ.createRole.body.parse(req.body);
    if (BUILTIN_ROLES[body.key]) throw conflict("ROLE_EXISTS", "That is a built-in role");
    checkGrantable(req, body.permissions);
    await db.tx(async (q) => {
      const [dup] = await q(`SELECT 1 FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, body.key]);
      if (dup) throw conflict("ROLE_EXISTS", "A role with this key exists");
      await q(`INSERT INTO roles (tenant_id, key, name, description, permissions, created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`, [tenant, body.key, body.name, body.description, JSON.stringify([...new Set(body.permissions)].sort()), req.principal!.id]);
      await audit(q, tenant, { action: "role.create", actor: actorOf(req), request: req.info, resource: { type: "role", id: body.key, permissions: body.permissions } });
    });
    return { ok: true };
  });

  app.put("/v1/manage/roles/:key", { preHandler: admin }, async (req) => {
    const { key } = AUTHZ.updateRole.params.parse(req.params);
    const body = AUTHZ.updateRole.body.parse(req.body);
    checkGrantable(req, body.permissions);
    await db.tx(async (q) => {
      const [before] = await q<{ permissions: unknown }>(`SELECT permissions FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, key]);
      if (!before) throw notFound("Role");
      const perms = [...new Set(body.permissions)].sort();
      await q(`UPDATE roles SET name = $3, description = $4, permissions = $5::jsonb, updated_at = clock_timestamp() WHERE tenant_id = $1 AND key = $2`, [tenant, key, body.name, body.description, JSON.stringify(perms)]);
      await audit(q, tenant, { action: "role.update", actor: actorOf(req), request: req.info, resource: { type: "role", id: key }, changes: [{ op: "replace", path: "/permissions", old: asList(before.permissions), new: perms }] });
    });
    return { ok: true };
  });

  app.delete("/v1/manage/roles/:key", { preHandler: admin }, async (req) => {
    const { key } = AUTHZ.deleteRole.params.parse(req.params);
    await db.tx(async (q) => {
      const [r] = await q(`SELECT 1 FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, key]);
      if (!r) throw notFound("Role");
      const [used] = await q(`SELECT 1 FROM principals WHERE tenant_id = $1 AND role = $2 AND deleted_at IS NULL LIMIT 1`, [tenant, key]);
      if (used) throw conflict("ROLE_IN_USE", "Operators still have this role");
      await q(`DELETE FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, key]);
      await audit(q, tenant, { action: "role.delete", actor: actorOf(req), request: req.info, resource: { type: "role", id: key } });
    });
    return { ok: true };
  });
}
