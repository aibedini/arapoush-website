import type { FastifyInstance, FastifyRequest } from "fastify";
import { CONTENT_TYPES } from "@arapoush/schema";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { actorOf } from "../auth/principal.ts";
import { evaluate, grantsFor, project, projectSchema, type Grant } from "../authz/grants.ts";
import { getEntry, getRevision, typeOrThrow } from "../content/service.ts";
import { CrInput, createCr, itemsOf, resubmitCr, withdrawCr } from "../cr/service.ts";
import { previewLink } from "../delivery/preview.ts";
import { forbidden, notFound, badRequest } from "../http/problem.ts";
import { ingest } from "../media/service.ts";
import { requirePartner } from "../oauth/bearer.ts";
import { idempotent, requireSignature } from "./integrity.ts";

/**
 * Partner API for AraCMS (plan §9.3). Every call: DPoP-bound token, network and scope (requirePartner),
 * then grants per type/field/locale. Writes also need an RFC 9421 signature and an Idempotency-Key,
 * and never touch drafts directly: they become change requests.
 */
export async function partnerModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const sign = requireSignature(deps);
  const grantsOf = (req: FastifyRequest) => grantsFor(db.q, tenant, req.principal!);
  const deny = async (req: FastifyRequest, rule: string, detail: string) => {
    await auditNow(db, tenant, { action: "authz.denied", result: "denied", actor: actorOf(req), request: req.info, resource: { rule } });
    return forbidden("GRANT_DENIED", detail);
  };
  const readable = (grants: Grant[], type: string) => {
    const schema = typeOrThrow(type).schema;
    return (path: string, locale?: string) => evaluate(grants, schema, { type, path: path || "/", locale, action: "read" }).allow;
  };
  const who = async (req: FastifyRequest) => {
    const p = req.principal!;
    const [c] = await db.q<{ client_id: string }>(`SELECT client_id FROM partner_clients WHERE id = $1`, [p.partnerClientId]);
    return { actor: actorOf(req), request: req.info, principalId: p.id, role: p.role, partnerClientId: p.partnerClientId, partnerClientKey: c?.client_id ?? "", grants: await grantsOf(req) };
  };

  app.get("/v1/partner/me", { preHandler: requirePartner(deps, "content:read") }, async (req) => {
    const p = req.principal!;
    const grants = await grantsOf(req);
    return { id: p.id, kind: p.kind, display: p.display, role: p.role, client: p.clientId, scopes: p.scopes, grants: grants.map((g) => ({ id: g.id, subject: `${g.subject_kind}:${g.subject_id}`, scope: g.scope, actions: g.actions, expires_at: g.expires_at })) };
  });

  // The types and fields this caller may read, with labels, limits and locales: AraCMS builds its forms from it.
  app.get("/v1/partner/schema", { preHandler: requirePartner(deps, "content:read") }, async (req) => {
    const grants = await grantsOf(req);
    return CONTENT_TYPES.flatMap((t) => {
      const can = readable(grants, t.key);
      const schema = projectSchema(t.schema, (p) => can(p));
      if (!schema) return [];
      const proposable = projectSchema(t.schema, (p) => evaluate(grants, t.schema, { type: t.key, path: p, action: "propose" }).allow);
      return [{ key: t.key, label: t.label, version: t.version, schema, proposable }];
    });
  });

  app.get("/v1/partner/content/:type", { preHandler: requirePartner(deps, "content:read") }, async (req, reply) => {
    const { type } = req.params as { type: string };
    const t = typeOrThrow(type);
    const grants = await grantsOf(req);
    const can = readable(grants, type);
    if (!projectSchema(t.schema, (p) => can(p))) throw await deny(req, "grant.read", `No read access to ${type}`);
    const e = await getEntry(db.q, tenant, type);
    const rev = e.draft_revision_id ? await getRevision(db.q, e.draft_revision_id) : null;
    reply.header("ETag", `"${rev?.id ?? ""}"`);
    return { type, base_revision_id: rev?.id ?? null, number: rev?.number ?? 0, updated_at: rev?.created_at ?? null, published_revision_id: e.published_revision_id, data: project(t.schema, rev?.data ?? {}, can) };
  });

  app.get("/v1/partner/content/:type/history", { preHandler: requirePartner(deps, "content:read") }, async (req) => {
    const { type } = req.params as { type: string };
    const t = typeOrThrow(type);
    const can = readable(await grantsOf(req), type);
    if (!projectSchema(t.schema, (p) => can(p))) throw await deny(req, "grant.read", `No read access to ${type}`);
    const e = await getEntry(db.q, tenant, type);
    const { revision } = req.query as { revision?: string };
    if (revision) {
      const r = await getRevision(db.q, revision).catch(() => null);
      if (!r || r.entry_id !== e.id) throw notFound("Revision");
      return { id: r.id, number: r.number, created_at: r.created_at, data: project(t.schema, r.data, can) };
    }
    return db.q(
      `SELECT r.id, r.number, r.created_at, r.via_cr_id, p.kind AS author_kind, (r.id = $2) AS is_draft, (r.id = $3) AS is_published
         FROM revisions r LEFT JOIN principals p ON p.id = r.author_principal_id WHERE r.entry_id = $1 ORDER BY r.number DESC LIMIT 100`,
      [e.id, e.draft_revision_id, e.published_revision_id],
    );
  });

  // Media: the file is the body (application/octet-stream), so the signature's digest covers it.
  app.post(
    "/v1/partner/media",
    { preHandler: [requirePartner(deps, "media:upload"), sign], bodyLimit: 25 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: "1 hour" } } },
    idempotent(deps, async (req) => {
      const grants = await grantsOf(req);
      if (!grants.some((g) => g.actions.includes("media.upload"))) throw await deny(req, "grant.media.upload", "No media upload grant");
      if (!Buffer.isBuffer(req.body)) throw badRequest("NO_FILE", "Send the file as application/octet-stream with an X-Filename header");
      const name = String(req.headers["x-filename"] ?? "upload").replace(/[^\w.\- ]/g, "_").slice(0, 120);
      const a = await ingest(deps, { buf: req.body, name, actor: actorOf(req), request: req.info });
      return { asset: a.id, status: a.status, mime: a.mime, width: a.width, height: a.height, bytes: a.bytes };
    }),
  );

  app.get("/v1/partner/media/:id", { preHandler: requirePartner(deps, "content:read") }, async (req) => {
    const { id } = req.params as { id: string };
    const [a] = await db.q(
      `SELECT a.id AS asset, a.status, a.scan, a.mime, a.width, a.height, a.bytes, a.public, a.created_at FROM assets a JOIN principals p ON p.id = a.uploaded_by
        WHERE a.id = $1 AND a.tenant_id = $2 AND p.partner_client_id = $3`,
      [id, tenant, req.principal!.partnerClientId],
    );
    if (!a) throw notFound("Asset");
    return a;
  });

  // ── Change requests ──
  app.post(
    "/v1/partner/change-requests",
    { preHandler: [requirePartner(deps, "content:propose"), sign], config: { rateLimit: { max: 300, timeWindow: "1 hour" } } },
    idempotent(deps, async (req, reply) => {
      const body = CrInput.parse(req.body);
      const r = await createCr(deps, body, await who(req), String(req.headers["idempotency-key"]));
      reply.status(201);
      return r;
    }),
  );

  const canReadAll = async (req: FastifyRequest) => (await grantsOf(req)).some((g) => g.actions.includes("cr.read_all"));
  const own = async (req: FastifyRequest, id: string) => {
    const all = await canReadAll(req);
    const [cr] = await db.q<Record<string, unknown>>(
      `SELECT id, title, note, state, decision, conflicts, created_at, updated_at, decided_at, published_at, decision_reason, author_principal_id = $4 AS mine
         FROM change_requests WHERE id = $1 AND tenant_id = $2 AND partner_client_id = $3 AND ($5 OR author_principal_id = $4)`,
      [id, tenant, req.principal!.partnerClientId, req.principal!.id, all],
    );
    if (!cr) throw notFound("Change request");
    return cr;
  };

  app.get("/v1/partner/change-requests", { preHandler: requirePartner(deps, "cr:read") }, async (req) => {
    const { state } = z.object({ state: z.string().max(20).optional() }).parse(req.query);
    return db.q(
      `SELECT id, title, state, created_at, updated_at, decision->>'effect' AS effect FROM change_requests
        WHERE tenant_id = $1 AND partner_client_id = $2 AND ($3 OR author_principal_id = $4) ${state ? "AND state = $5" : ""} ORDER BY created_at DESC LIMIT 200`,
      [tenant, req.principal!.partnerClientId, await canReadAll(req), req.principal!.id, ...(state ? [state] : [])],
    );
  });

  app.get("/v1/partner/change-requests/:id", { preHandler: requirePartner(deps, "cr:read") }, async (req) => {
    const cr = await own(req, (req.params as { id: string }).id);
    const items = (await itemsOf(db.q, String(cr.id))).map((i) => ({ id: i.id, entry: i.type_key, path: i.path, op: i.op, old: i.old_value, value: i.new_value, base_revision_id: i.base_revision_id, decision: i.decision, reason: i.decision_reason, by_operator: !!i.added_by }));
    return { ...cr, items };
  });

  app.post(
    "/v1/partner/change-requests/:id/withdraw",
    { preHandler: [requirePartner(deps, "cr:withdraw"), sign] },
    idempotent(deps, async (req) => {
      const p = req.principal!;
      if (!(await grantsOf(req)).some((g) => g.actions.includes("cr.withdraw"))) throw await deny(req, "grant.cr.withdraw", "No withdraw grant");
      return withdrawCr(deps, (req.params as { id: string }).id, { actor: actorOf(req), request: req.info, principalId: p.id, canAll: await canReadAll(req), partnerClientId: p.partnerClientId });
    }),
  );

  app.post(
    "/v1/partner/change-requests/:id/resubmit",
    { preHandler: [requirePartner(deps, "content:propose"), sign] },
    idempotent(deps, async (req) => {
      const { base_revision_ids } = z.strictObject({ base_revision_ids: z.record(z.string().max(80), z.string().max(40)) }).parse(req.body);
      return resubmitCr(deps, (req.params as { id: string }).id, await who(req), base_revision_ids);
    }),
  );

  // A signed preview of the website with this CR applied (30 minutes).
  app.post(
    "/v1/partner/previews",
    { preHandler: [requirePartner(deps, "cr:read"), sign] },
    idempotent(deps, async (req) => {
      const { cr, locale } = z.strictObject({ cr: z.string().max(40), locale: z.enum(["fa", "en", "tr"]).default("fa") }).parse(req.body);
      const row = await own(req, cr);
      const [first] = await itemsOf(db.q, String(row.id));
      const link = await previewLink(config, { sub: req.principal!.id, type: first?.type_key ?? "page.home.hero", locale, cr });
      await auditNow(db, tenant, { action: "content.preview", actor: actorOf(req), request: req.info, resource: { type: "change_request", id: cr, jti: link.jti } });
      return { url: link.url, expiresIn: link.expiresIn };
    }),
  );
}
