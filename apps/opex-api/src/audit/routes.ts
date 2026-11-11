import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { auditNow, verifyChain } from "./audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";

const Filters = z.object({
  action: z.string().max(80).optional(),
  actor: z.string().max(80).optional(),
  client: z.string().max(80).optional(),
  ip: z.string().max(64).optional(),
  resource: z.string().max(120).optional(),
  path: z.string().max(200).optional(),
  result: z.enum(["success", "failure", "denied"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function where(f: z.infer<typeof Filters>, tenant: string) {
  const conds = ["tenant_id = $1"];
  const params: unknown[] = [tenant];
  // Each "?" becomes the next bind parameter; values are never interpolated into SQL.
  const add = (sql: string, ...values: unknown[]) => {
    let i = 0;
    conds.push(sql.replace(/\?/g, () => (params.push(values[i++]), `$${params.length}`)));
  };
  if (f.action) add("action LIKE ?", f.action.replace(/\*/g, "%"));
  if (f.actor) add("(actor->>'id' = ? OR actor->>'display' ILIKE ?)", f.actor, `%${f.actor}%`);
  if (f.client) add("actor->>'via_client' = ?", f.client);
  if (f.ip) add("(request->>'ip' = ? OR request->>'asserted_end_user_ip' = ?)", f.ip, f.ip);
  if (f.resource) add("resource::text ILIKE ?", `%${f.resource}%`);
  if (f.path) add("changes::text ILIKE ?", `%${f.path}%`);
  if (f.result) add("result = ?", f.result);
  if (f.from) add("ts >= ?", f.from);
  if (f.to) add("ts <= ?", f.to);
  if (f.before) add("seq < ?", f.before);
  return { sql: conds.join(" AND "), params };
}

/** Audit log for operators and auditors: search, chain verification, export (plan §8.5). */
export async function auditModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;

  app.get("/v1/manage/audit", { preHandler: requireOperator(deps, "auditor") }, async (req) => {
    const f = Filters.parse(req.query);
    const w = where(f, tenant);
    return db.q(`SELECT seq, id, ts, action, result, actor, request, resource, changes, reason, hash FROM audit_events WHERE ${w.sql} ORDER BY seq DESC LIMIT ${f.limit}`, w.params);
  });

  app.get("/v1/manage/audit/verify", { preHandler: requireOperator(deps, "auditor") }, async (req) => {
    const { from, to } = z.object({ from: z.coerce.number().int().min(1).default(1), to: z.coerce.number().int().optional() }).parse(req.query);
    const r = await verifyChain(db, tenant, from, to);
    await auditNow(db, tenant, { action: "audit.verify", result: r.ok ? "success" : "failure", actor: actorOf(req), request: req.info, resource: { from, to: to ?? null, checked: r.checked, firstBad: r.firstBad ?? null } });
    return r;
  });

  // Export needs a fresh second factor and is itself audited.
  app.get("/v1/manage/audit/export", { preHandler: [requireOperator(deps, "auditor"), requireStepUp(deps)] }, async (req, reply) => {
    const f = Filters.parse({ ...(req.query as object), limit: 500 });
    const w = where(f, tenant);
    const rows = await db.q(`SELECT * FROM audit_events WHERE ${w.sql} ORDER BY seq LIMIT 50000`, w.params);
    await auditNow(db, tenant, { action: "audit.export", actor: actorOf(req), request: req.info, resource: { rows: rows.length, filters: f } });
    reply.header("Content-Type", "application/x-ndjson; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="opex-audit-${new Date().toISOString().slice(0, 10)}.jsonl"`);
    return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  });

  app.get("/v1/manage/dashboard", { preHandler: requireOperator(deps) }, async () => {
    const one = async <T,>(sql: string, p: unknown[] = [tenant]) => ((await db.q<Record<string, T>>(sql, p))[0] ?? {}) as Record<string, T>;
    const [crs, entries, sec, hooks, head, inq] = await Promise.all([
      one<number>(`SELECT count(*) FILTER (WHERE state = 'pending_review')::int AS pending, count(*) FILTER (WHERE state = 'needs_rebase')::int AS rebase, count(*) FILTER (WHERE state IN ('approved','published') AND decided_at > clock_timestamp() - interval '7 days')::int AS approved7d FROM change_requests WHERE tenant_id = $1`),
      one<number>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE draft_revision_id IS DISTINCT FROM published_revision_id)::int AS unpublished, count(*) FILTER (WHERE scheduled_at IS NOT NULL)::int AS scheduled FROM entries WHERE tenant_id = $1`),
      one<number>(`SELECT count(*) FILTER (WHERE action IN ('auth.login.failure','oauth.login.failure','auth.mfa.failure','oauth.mfa.failure'))::int AS failed_logins, count(*) FILTER (WHERE result = 'denied')::int AS denies, count(*) FILTER (WHERE action = 'auth.lockout')::int AS lockouts FROM audit_events WHERE tenant_id = $1 AND ts > clock_timestamp() - interval '24 hours'`),
      one<number>(`SELECT count(*) FILTER (WHERE status = 'pending' AND attempt > 0)::int AS retrying, count(*) FILTER (WHERE status = 'dead')::int AS dead FROM webhook_deliveries WHERE tenant_id = $1`),
      one<string>(`SELECT seq::text, hash FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`),
      one<number>(`SELECT count(*) FILTER (WHERE handled_at IS NULL)::int AS open, count(*) FILTER (WHERE created_at > clock_timestamp() - interval '7 days')::int AS week FROM inquiries WHERE tenant_id = $1`),
    ]);
    const recent = await db.q(`SELECT seq, ts, action, result, actor->>'display' AS who, actor->>'kind' AS kind, request->>'ip' AS ip, resource FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 12`, [tenant]);
    return { crs, entries, security24h: sec, webhooks: hooks, auditHead: head, inquiries: inq, recent };
  });
}
