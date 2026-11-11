import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAt } from "@arapoush/schema";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { GRANT_ACTIONS } from "../authz/grants.ts";
import { getEntry, getRevision } from "../content/service.ts";
import { badRequest, notFound } from "../http/problem.ts";
import { token, ulid } from "../ids.ts";
import { evaluatePolicies, type Policy } from "./policy.ts";
import { amendCr, approveCr, itemsOf, publishCr, rejectCr } from "./service.ts";

const Glob = z.string().min(1).max(120);
const GrantBody = z.strictObject({
  subject_kind: z.enum(["partner_role", "partner_user", "partner_client"]),
  subject_id: z.string().min(2).max(80),
  scope: z.strictObject({ types: z.array(Glob).min(1).max(50), fields: z.array(Glob).max(100).optional(), exclude: z.array(Glob).max(100).optional(), locales: z.array(z.enum(["fa", "en", "tr"])).max(3).optional() }),
  actions: z.array(z.enum(GRANT_ACTIONS)).min(1),
  expires_at: z.string().datetime().nullable().optional(),
});
const PolicyBody = z.strictObject({
  name: z.string().min(2).max(160),
  priority: z.number().int().min(0).max(10000).default(100),
  scope: z.strictObject({ partners: z.array(z.string().max(80)).optional(), types: z.array(Glob).optional(), fields: z.array(Glob).optional(), locales: z.array(z.enum(["fa", "en", "tr"])).optional() }),
  conditions: z
    .strictObject({
      maxItems: z.number().int().min(1).max(50).optional(),
      textEditDistanceRatio: z.strictObject({ lte: z.number().min(0).max(1) }).optional(),
      maxLengthDelta: z.number().int().min(0).optional(),
      noNewAssets: z.boolean().optional(),
      assetsOnly: z.boolean().optional(),
      noLinks: z.boolean().optional(),
      locales: z.array(z.enum(["fa", "en", "tr"])).optional(),
      principalRoles: z.array(z.string().max(40)).optional(),
      principals: z.array(z.string().max(40)).optional(),
      timeWindow: z.strictObject({ tz: z.string().max(60), days: z.array(z.enum(["sat", "sun", "mon", "tue", "wed", "thu", "fri"])).optional(), from: z.string().regex(/^\d\d:\d\d$/).optional(), to: z.string().regex(/^\d\d:\d\d$/).optional() }).optional(),
      entryCreate: z.boolean().optional(),
      entryDelete: z.boolean().optional(),
      requiresSecondApprover: z.boolean().optional(),
      cooldown: z.strictObject({ maxPerHour: z.number().int().min(1).max(1000) }).optional(),
    })
    .default({}),
  effect: z.enum(["auto_approve", "require_review", "deny"]),
  auto_publish: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
const SimItem = z.strictObject({ type: z.string().max(80), path: z.string().max(300), op: z.enum(["set", "insert", "remove"]).default("set"), old: z.unknown().optional(), value: z.unknown().optional(), newAssets: z.array(z.string()).optional() });

/** Operator side of change requests (review, partial approval, amendments), grants, policies, webhooks. */
export async function crManageModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const read = requireOperator(deps, "viewer");
  const write = requireOperator(deps, "operator");
  const admin = [requireOperator(deps, "super_admin"), requireStepUp(deps)];
  const who = (req: FastifyRequest) => ({ actor: actorOf(req), request: req.info, operatorId: req.principal!.id });

  app.get("/v1/manage/change-requests", { preHandler: read }, async (req) => {
    const { state } = z.object({ state: z.string().max(20).optional() }).parse(req.query);
    return db.q(
      `SELECT cr.id, cr.title, cr.state, cr.created_at, cr.updated_at, cr.four_eyes, jsonb_array_length(cr.approvals) AS approvals, cr.decision->>'effect' AS effect,
              p.display_name AS author, c.name AS partner, (SELECT count(*)::int FROM change_items ci WHERE ci.cr_id = cr.id) AS items,
              (SELECT array_agg(DISTINCT e.type_key) FROM change_items ci JOIN entries e ON e.id = ci.entry_id WHERE ci.cr_id = cr.id) AS entries
         FROM change_requests cr LEFT JOIN principals p ON p.id = cr.author_principal_id LEFT JOIN partner_clients c ON c.id = cr.partner_client_id
        WHERE cr.tenant_id = $1 ${state ? "AND cr.state = $2" : ""} ORDER BY cr.created_at DESC LIMIT 300`,
      state ? [tenant, state] : [tenant],
    );
  });

  // Detail with each item's current draft value, so reviewers see what changed since the author's base.
  app.get("/v1/manage/change-requests/:id", { preHandler: read }, async (req) => {
    const { id } = req.params as { id: string };
    const [cr] = await db.q<Record<string, unknown>>(
      `SELECT cr.*, p.display_name AS author, p.role AS author_role, c.name AS partner FROM change_requests cr LEFT JOIN principals p ON p.id = cr.author_principal_id LEFT JOIN partner_clients c ON c.id = cr.partner_client_id WHERE cr.id = $1 AND cr.tenant_id = $2`,
      [id, tenant],
    );
    if (!cr) throw notFound("Change request");
    const items = await itemsOf(db.q, id);
    const drafts = new Map<string, unknown>();
    for (const t of new Set(items.map((i) => i.type_key))) {
      const e = await getEntry(db.q, tenant, t);
      drafts.set(t, e.draft_revision_id ? (await getRevision(db.q, e.draft_revision_id)).data : {});
    }
    return { ...cr, items: items.map((i) => ({ ...i, current: getAt(drafts.get(i.type_key), i.path) ?? null, stale: JSON.stringify(getAt(drafts.get(i.type_key), i.path) ?? null) !== JSON.stringify(i.old_value ?? null) })) };
  });

  const Decisions = z.record(z.string().max(40), z.strictObject({ decision: z.enum(["approved", "rejected"]), reason: z.string().max(500).optional() }));
  app.post("/v1/manage/change-requests/:id/approve", { preHandler: write }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.strictObject({ publish: z.boolean().default(false), decisions: Decisions.optional() }).parse(req.body ?? {});
    if (body.publish) {
      // Publishing site-wide content needs a fresh second factor, as in the content editor.
      const types = (await itemsOf(db.q, id)).map((i) => i.type_key);
      if (types.some((t) => t.startsWith("global."))) await requireStepUp(deps)(req);
    }
    return approveCr(deps, id, who(req), body);
  });
  app.post("/v1/manage/change-requests/:id/reject", { preHandler: write }, async (req) => {
    const { reason } = z.strictObject({ reason: z.string().min(3).max(500) }).parse(req.body);
    return rejectCr(deps, (req.params as { id: string }).id, who(req), reason);
  });
  app.post("/v1/manage/change-requests/:id/amend", { preHandler: write }, async (req) => {
    const { item, value } = z.strictObject({ item: z.string().max(40), value: z.unknown() }).parse(req.body);
    return amendCr(deps, (req.params as { id: string }).id, who(req), item, value);
  });
  app.post("/v1/manage/change-requests/:id/publish", { preHandler: write }, async (req) => {
    const { id } = req.params as { id: string };
    if ((await itemsOf(db.q, id)).some((i) => i.type_key.startsWith("global."))) await requireStepUp(deps)(req);
    return publishCr(deps, id, who(req));
  });

  // ── Grants (super admin, step-up) ──
  app.get("/v1/manage/grants", { preHandler: write }, async () => db.q(`SELECT * FROM grants WHERE tenant_id = $1 ORDER BY created_at`, [tenant]));
  app.post("/v1/manage/grants", { preHandler: admin }, async (req) => {
    const b = GrantBody.parse(req.body);
    const id = ulid("grt_");
    await db.tx(async (q) => {
      await q(`INSERT INTO grants (id, tenant_id, subject_kind, subject_id, scope, actions, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, tenant, b.subject_kind, b.subject_id, JSON.stringify(b.scope), b.actions, b.expires_at ?? null, req.principal!.id]);
      await audit(q, tenant, { action: "grant.create", actor: actorOf(req), request: req.info, resource: { type: "grant", id, ...b } });
    });
    return { id };
  });
  app.delete("/v1/manage/grants/:id", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    await db.tx(async (q) => {
      const [g] = await q(`DELETE FROM grants WHERE id = $1 AND tenant_id = $2 RETURNING *`, [id, tenant]);
      if (!g) throw notFound("Grant");
      await audit(q, tenant, { action: "grant.delete", actor: actorOf(req), request: req.info, resource: { type: "grant", id, was: g } });
    });
    return { ok: true };
  });

  // ── Policies ──
  app.get("/v1/manage/policies", { preHandler: read }, async () => db.q(`SELECT * FROM approval_policies WHERE tenant_id = $1 ORDER BY priority DESC, created_at`, [tenant]));

  // Simulator: what would happen to these items with the current policies (plus an optional draft policy)?
  app.post("/v1/manage/policies/simulate", { preHandler: read }, async (req) => {
    const b = z.strictObject({ items: z.array(SimItem).min(1).max(200), policy: PolicyBody.optional(), partner: z.string().max(80).default(""), role: z.string().max(40).nullable().default(null), principal: z.string().max(40).default("simulated"), at: z.string().datetime().optional() }).parse(req.body);
    const policies = await db.q<Policy>(`SELECT id, name, priority, scope, conditions, effect, auto_publish, enabled FROM approval_policies WHERE tenant_id = $1 AND enabled`, [tenant]);
    if (b.policy) policies.push({ ...b.policy, id: "draft" } as Policy);
    return evaluatePolicies(b.items as never, policies, { partner: b.partner, principal: b.principal, role: b.role, now: b.at ? new Date(b.at) : new Date(), autoApprovedLastHour: 0, assetsPending: false });
  });

  const savePolicy = async (req: FastifyRequest, id: string, b: z.infer<typeof PolicyBody>, create: boolean) => {
    if (b.effect === "auto_approve" && !b.scope.types?.length) throw badRequest("POLICY_TOO_BROAD", "Auto-approve policies must name the content types they cover");
    await db.tx(async (q) => {
      const [before] = create ? [null] : await q(`SELECT * FROM approval_policies WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
      if (!create && !before) throw notFound("Policy");
      if (create) await q(`INSERT INTO approval_policies (id, tenant_id, name, priority, scope, conditions, effect, auto_publish, enabled, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, tenant, b.name, b.priority, JSON.stringify(b.scope), JSON.stringify(b.conditions), b.effect, b.auto_publish, b.enabled, req.principal!.id]);
      else await q(`UPDATE approval_policies SET name = $2, priority = $3, scope = $4, conditions = $5, effect = $6, auto_publish = $7, enabled = $8 WHERE id = $1`, [id, b.name, b.priority, JSON.stringify(b.scope), JSON.stringify(b.conditions), b.effect, b.auto_publish, b.enabled]);
      await audit(q, tenant, { action: create ? "policy.create" : "policy.update", actor: actorOf(req), request: req.info, resource: { type: "policy", id, ...b }, changes: before ? [{ op: "replace", path: "/", old: before, new: b }] : undefined });
    });
    return { id };
  };
  app.post("/v1/manage/policies", { preHandler: admin }, async (req) => savePolicy(req, ulid("pol_"), PolicyBody.parse(req.body), true));
  app.put("/v1/manage/policies/:id", { preHandler: admin }, async (req) => savePolicy(req, (req.params as { id: string }).id, PolicyBody.parse(req.body), false));
  app.delete("/v1/manage/policies/:id", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    await db.tx(async (q) => {
      const [p] = await q(`DELETE FROM approval_policies WHERE id = $1 AND tenant_id = $2 RETURNING *`, [id, tenant]);
      if (!p) throw notFound("Policy");
      await audit(q, tenant, { action: "policy.delete", actor: actorOf(req), request: req.info, resource: { type: "policy", id, was: p } });
    });
    return { ok: true };
  });

  // ── AraCMS webhook endpoint (the secret is shown once) ──
  app.put("/v1/manage/partners/:id/webhook", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    const { url } = z.strictObject({ url: z.string().url().refine((u) => u.startsWith("https://") || (!config.isProd && u.startsWith("http://")), "https only").nullable() }).parse(req.body);
    const secret = url ? token(32) : null;
    await db.tx(async (q) => {
      const [c] = await q(`UPDATE partner_clients SET webhook_url = $3, webhook_secret = $4 WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant, url, secret]);
      if (!c) throw notFound("Partner");
      await audit(q, tenant, { action: "partner.webhook_set", actor: actorOf(req), request: req.info, resource: { type: "partner_client", id, url } });
    });
    return { url, secret };
  });

  app.get("/v1/manage/webhooks", { preHandler: write }, async () =>
    db.q(`SELECT id, target, event, status, attempt, last_code, last_error, next_attempt_at, created_at FROM webhook_deliveries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenant]),
  );
  app.post("/v1/manage/webhooks/:id/retry", { preHandler: write }, async (req) => {
    const { id } = req.params as { id: string };
    await db.tx(async (q) => {
      const [d] = await q(`UPDATE webhook_deliveries SET status = 'pending', next_attempt_at = clock_timestamp() WHERE id = $1 AND tenant_id = $2 AND status IN ('dead','failed','pending') RETURNING id`, [id, tenant]);
      if (!d) throw notFound("Delivery");
      await audit(q, tenant, { action: "webhook.retry", actor: actorOf(req), request: req.info, resource: { type: "webhook_delivery", id } });
    });
    return { ok: true };
  });
}
