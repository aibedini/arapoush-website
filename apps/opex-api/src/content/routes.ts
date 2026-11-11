import type { FastifyInstance } from "fastify";
import { CONTENT_TYPES, getAt, isLockedPath, setAt } from "@arapoush/schema";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, forbidden, notFound } from "../http/problem.ts";
import { diff } from "./diff.ts";
import { getEntry, getRevision, publish, saveDraft, typeOrThrow } from "./service.ts";
import { recheckOpen } from "../cr/service.ts";

const SENSITIVE = (key: string) => key.startsWith("global.");

/** Management API for operators: types, entries, drafts, revisions, publish, rollback, schedule. */
export async function contentModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const read = requireOperator(deps, "viewer");
  const write = requireOperator(deps, "operator");

  app.get("/v1/manage/types", { preHandler: read }, async () => CONTENT_TYPES.map((t) => ({ key: t.key, label: t.label, singleton: t.singleton, version: t.version })));
  app.get("/v1/manage/types/:key", { preHandler: read }, async (req) => typeOrThrow((req.params as { key: string }).key));

  app.get("/v1/manage/entries", { preHandler: read }, async () =>
    db.q(
      `SELECT e.id, e.type_key, e.slug, e.status, e.draft_revision_id, e.published_revision_id, e.scheduled_at,
              d.number AS draft_number, d.created_at AS draft_at, p.number AS published_number, p.created_at AS published_at,
              (e.draft_revision_id IS DISTINCT FROM e.published_revision_id) AS unpublished_changes,
              (SELECT count(*)::int FROM change_items ci JOIN change_requests cr ON cr.id = ci.cr_id WHERE ci.entry_id = e.id AND cr.state IN ('pending_review','needs_rebase')) AS open_crs
         FROM entries e LEFT JOIN revisions d ON d.id = e.draft_revision_id LEFT JOIN revisions p ON p.id = e.published_revision_id
        WHERE e.tenant_id = $1 ORDER BY e.type_key`,
      [tenant],
    ),
  );

  app.get("/v1/manage/entries/:type", { preHandler: read }, async (req, reply) => {
    const { type } = req.params as { type: string };
    const t = typeOrThrow(type);
    const e = await getEntry(db.q, tenant, type);
    const draft = e.draft_revision_id ? await getRevision(db.q, e.draft_revision_id) : null;
    const published = e.published_revision_id && e.published_revision_id !== e.draft_revision_id ? await getRevision(db.q, e.published_revision_id) : null;
    reply.header("ETag", `"${e.draft_revision_id}"`);
    return { entry: e, schema: t.schema, draft, publishedData: published?.data ?? null, changesSincePublish: published && draft ? diff(published.data, draft.data) : [] };
  });

  // Whole-draft save (console form). If-Match / base_revision_id guards concurrent edits.
  app.put("/v1/manage/entries/:type", { preHandler: write }, async (req) => {
    const { type } = req.params as { type: string };
    const body = z.strictObject({ data: z.record(z.string(), z.unknown()), base_revision_id: z.string().nullable(), note: z.string().max(500).optional() }).parse(req.body);
    const t = typeOrThrow(type);
    return db.tx(async (q) => {
      const e = await getEntry(q, tenant, type, "main", true);
      // Locked fields can only change with super admin + fresh step-up.
      const current = e.draft_revision_id ? (await getRevision(q, e.draft_revision_id)).data : {};
      const lockedChanged = diff(current, body.data).filter((c) => isLockedPath(t.schema, c.path));
      if (lockedChanged.length) {
        const p = req.principal!;
        const fresh = p.stepUpAt && Date.now() - p.stepUpAt.getTime() < 300_000;
        if (p.role !== "super_admin" || !fresh) throw forbidden("FIELD_LOCKED", "Locked fields need a super admin with a fresh step-up", { paths: lockedChanged.map((c) => c.path).slice(0, 20) });
      }
      const { revision, changes } = await saveDraft(q, tenant, { typeKey: type, data: body.data, baseRevisionId: body.base_revision_id, actor: actorOf(req), request: req.info, note: body.note });
      // Open change requests on fields the operator just changed now need a rebase.
      if (changes.length) await recheckOpen(q, tenant, type, { actor: actorOf(req), request: req.info });
      return { revision: { id: revision.id, number: revision.number }, changes: changes.length };
    });
  });

  // Field-level edits (path + value), same concurrency rule.
  app.patch("/v1/manage/entries/:type", { preHandler: write }, async (req) => {
    const { type } = req.params as { type: string };
    const body = z.strictObject({ base_revision_id: z.string().nullable(), ops: z.array(z.object({ path: z.string().startsWith("/").max(300), value: z.unknown() })).min(1).max(200), note: z.string().max(500).optional() }).parse(req.body);
    const t = typeOrThrow(type);
    return db.tx(async (q) => {
      const e = await getEntry(q, tenant, type, "main", true);
      let data: unknown = e.draft_revision_id ? (await getRevision(q, e.draft_revision_id)).data : {};
      for (const op of body.ops) {
        if (isLockedPath(t.schema, op.path)) {
          const p = req.principal!;
          if (p.role !== "super_admin" || !p.stepUpAt || Date.now() - p.stepUpAt.getTime() > 300_000) throw forbidden("FIELD_LOCKED", `${op.path} is locked`);
        }
        if (getAt(data, op.path.replace(/@\w+$/, "")) === undefined && !op.path.includes("@")) throw badRequest("PATH_NOT_FOUND", `${op.path} does not exist`);
        try {
          data = setAt(data, op.path, op.value);
        } catch {
          throw badRequest("PATH_NOT_FOUND", `${op.path} does not exist`);
        }
      }
      const { revision, changes } = await saveDraft(q, tenant, { typeKey: type, data, baseRevisionId: body.base_revision_id, actor: actorOf(req), request: req.info, note: body.note });
      if (changes.length) await recheckOpen(q, tenant, type, { actor: actorOf(req), request: req.info });
      return { revision: { id: revision.id, number: revision.number }, changes };
    });
  });

  app.post("/v1/manage/entries/:type/publish", { preHandler: write }, async (req) => {
    const { type } = req.params as { type: string };
    if (SENSITIVE(type)) await requireStepUp(deps)(req);
    const { revision_id } = z.strictObject({ revision_id: z.string().optional() }).parse(req.body ?? {});
    return db.tx((q) => publish(q, tenant, { typeKey: type, revisionId: revision_id, actor: actorOf(req), request: req.info, trigger: "manual" }));
  });

  app.post("/v1/manage/entries/:type/rollback", { preHandler: [write, requireStepUp(deps)] }, async (req) => {
    const { type } = req.params as { type: string };
    const { revision_id } = z.strictObject({ revision_id: z.string() }).parse(req.body);
    return db.tx((q) => publish(q, tenant, { typeKey: type, revisionId: revision_id, actor: actorOf(req), request: req.info, trigger: "rollback" }));
  });

  app.post("/v1/manage/entries/:type/schedule", { preHandler: write }, async (req) => {
    const { type } = req.params as { type: string };
    const { at } = z.strictObject({ at: z.string().datetime().nullable() }).parse(req.body);
    if (at && new Date(at).getTime() < Date.now() + 60_000) throw badRequest("SCHEDULE_IN_PAST", "Schedule at least one minute ahead");
    await db.tx(async (q) => {
      const e = await getEntry(q, tenant, type, "main", true);
      await q(`UPDATE entries SET scheduled_at = $2 WHERE id = $1`, [e.id, at]);
      await audit(q, tenant, { action: at ? "content.schedule" : "content.unschedule", actor: actorOf(req), request: req.info, resource: { type: "entry", id: e.id, entry: type, at } });
    });
    return { ok: true };
  });

  app.get("/v1/manage/entries/:type/revisions", { preHandler: read }, async (req) => {
    const { type } = req.params as { type: string };
    const e = await getEntry(db.q, tenant, type);
    return db.q(
      `SELECT r.id, r.number, r.created_at, r.note, r.via_cr_id, r.author_principal_id, p.display_name AS author, p.kind AS author_kind,
              (r.id = $2) AS is_draft, (r.id = $3) AS is_published
         FROM revisions r LEFT JOIN principals p ON p.id = r.author_principal_id WHERE r.entry_id = $1 ORDER BY r.number DESC LIMIT 200`,
      [e.id, e.draft_revision_id, e.published_revision_id],
    );
  });

  app.get("/v1/manage/revisions/:id", { preHandler: read }, async (req) => getRevision(db.q, (req.params as { id: string }).id));

  app.get("/v1/manage/diff", { preHandler: read }, async (req) => {
    const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(req.query);
    const [a, b] = await Promise.all([getRevision(db.q, from), getRevision(db.q, to)]);
    if (a.entry_id !== b.entry_id) throw notFound("Comparable revisions");
    return diff(a.data, b.data);
  });
}
