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
    const [p] = await db.q<{ id: string; email: string | null; display_name: string; role: string; status: string; perm_allow: unknown; perm_deny: unknown }>(
      `SELECT id, email, display_name, role, status, perm_allow, perm_deny FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'operator'`,
      [id, tenant],
    );
    if (!p) throw notFound("Operator");
    const effective = [...(await effectivePermissions(db.q, tenant, p))].sort();
    return { ...p, perm_allow: asList(p.perm_allow), perm_deny: asList(p.perm_deny), effective };
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
      const [before] = await q<{ perm_allow: unknown; perm_deny: unknown }>(`SELECT perm_allow, perm_deny FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'operator'`, [id, tenant]);
      if (!before) throw notFound("Operator");
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
    const counts = await db.q<{ role: string; n: number }>(`SELECT role, count(*)::int AS n FROM principals WHERE tenant_id = $1 AND kind = 'operator' GROUP BY role`, [tenant]);
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
      const [used] = await q(`SELECT 1 FROM principals WHERE tenant_id = $1 AND role = $2 LIMIT 1`, [tenant, key]);
      if (used) throw conflict("ROLE_IN_USE", "Operators still have this role");
      await q(`DELETE FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, key]);
      await audit(q, tenant, { action: "role.delete", actor: actorOf(req), request: req.info, resource: { type: "role", id: key } });
    });
    return { ok: true };
  });
}
