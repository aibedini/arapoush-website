import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAt, setAt } from "@arapoush/schema";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit, type Actor, type RequestInfo } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { getEntry, getRevision, saveDraft } from "../content/service.ts";
import type { Change } from "../content/diff.ts";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../http/problem.ts";
import { safeEqual, ulid } from "../ids.ts";
import { ingest } from "../media/service.ts";

/**
 * 3D render pipeline (plan P10). The effervescent page's sizes, caps and posters are rendered from the
 * site's own 3D scene by the renderer service (apps/opex-renderer, headless Chromium):
 *
 *   draft change to a render input ──► job queued ──► renderer claims it, drives the scene,
 *   uploads each image (media pipeline) ──► OPEX writes images + dimension marks into a new draft
 *   revision ──► operators review and publish as usual.
 *
 * Only the render outputs are written back; everything else in the draft is left as it is.
 */
export const RENDER_TYPE = "product.effervescent.page";
const STALE_MINUTES = 15;
const RENDERER: Actor = { kind: "service", id: "renderer", display: "3D renderer" };

type Size = { id: string; d: number; h: number };
export type RenderInput = { sizes: Size[]; caps: string[]; defaultSize: string; renderPxPerMm: number };

/** The parts of a draft the renderer needs, checked so the scene never gets absurd geometry. */
export function renderInput(data: unknown): RenderInput {
  const d = (getAt(data, "/data") ?? {}) as { sizes?: Size[]; caps?: { variants?: { id: string }[] }; defaultSize?: string; renderPxPerMm?: number };
  const input = { sizes: (d.sizes ?? []).map((s) => ({ id: s.id, d: s.d, h: s.h })), caps: (d.caps?.variants ?? []).map((v) => v.id), defaultSize: d.defaultSize ?? "", renderPxPerMm: d.renderPxPerMm ?? 0 };
  return z
    .object({
      sizes: z.array(z.object({ id: z.string().regex(/^[\w-]{1,40}$/), d: z.number().min(10).max(80), h: z.number().min(30).max(320) })).min(1).max(30),
      caps: z.array(z.string().regex(/^[\w-]{1,40}$/)).max(10),
      defaultSize: z.string().min(1),
      renderPxPerMm: z.number().min(1).max(20),
    })
    .refine((x) => x.sizes.some((s) => s.id === x.defaultSize), "defaultSize must be one of the sizes")
    .parse(input);
}

/**
 * True when a draft change alters what the renders show: a size added, removed or resized, a cap
 * variant added or removed, the scale or the hero size. Marker positions, names and photos are not.
 */
export const touchesRender = (changes: Change[]) =>
  changes.some(
    (c) =>
      c.path === "/data/defaultSize" ||
      c.path === "/data/renderPxPerMm" ||
      /^\/data\/sizes(\[id=[^\]]+\](\/(d|h|id))?)?$/.test(c.path) ||
      /^\/data\/caps\/variants(\[id=[^\]]+\](\/id)?)?$/.test(c.path),
  );

/** Queues a render of the entry's current draft; older pending jobs for it are superseded. */
export async function enqueueRender(q: Q, tenant: string, who: { actor: Actor; request: RequestInfo }, reason: string) {
  const e = await getEntry(q, tenant, RENDER_TYPE);
  if (!e.draft_revision_id) throw badRequest("NO_DRAFT", "Nothing to render");
  const input = renderInput((await getRevision(q, e.draft_revision_id)).data);
  await q(`UPDATE render_jobs SET status = 'superseded', finished_at = clock_timestamp() WHERE tenant_id = $1 AND type_key = $2 AND status = 'pending'`, [tenant, RENDER_TYPE]);
  const id = ulid("rnd_");
  await q(`INSERT INTO render_jobs (id, tenant_id, type_key, revision_id, input, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [id, tenant, RENDER_TYPE, e.draft_revision_id, JSON.stringify(input), who.actor.id]);
  await audit(q, tenant, { action: "render.queued", actor: who.actor, request: who.request, resource: { type: "render_job", id, entry: RENDER_TYPE, revision: e.draft_revision_id, sizes: input.sizes.length, caps: input.caps.length }, reason });
  return id;
}

const Shot = z.object({ asset: z.string().regex(/^ast_[0-9A-Z]{26}$/), width: z.number().int().positive(), height: z.number().int().positive() });
const Result = z.strictObject({
  sizes: z.array(Shot.extend({ id: z.string(), base: z.number(), mouth: z.number(), left: z.number(), right: z.number() })),
  caps: z.array(Shot.extend({ id: z.string() })),
  uses: Shot.optional(),
  posters: z.partialRecord(z.enum(["wide-ltr", "tall-ltr", "wide-rtl", "tall-rtl"]), Shot).optional(),
});

export async function renderModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const renderer = async (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!config.RENDER_TOKEN) throw notFound();
    if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), config.RENDER_TOKEN)) throw unauthorized();
    req.principal = null;
  };
  const rendererWho = (req: FastifyRequest) => ({ actor: RENDERER, request: req.info });

  // Operators: queue a render by hand (super admin, fresh step-up: the outputs are locked fields).
  app.post("/v1/manage/render", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const id = await db.tx((q) => enqueueRender(q, tenant, { actor: actorOf(req), request: req.info }, "requested by an operator"));
    return { id };
  });
  app.get("/v1/manage/render/jobs", { preHandler: requireOperator(deps) }, async () =>
    db.q(`SELECT j.id, j.status, j.attempts, j.created_at, j.claimed_at, j.finished_at, j.error, j.revision_id, r.number AS revision, jsonb_array_length(j.input->'sizes') AS sizes FROM render_jobs j LEFT JOIN revisions r ON r.id = j.revision_id WHERE j.tenant_id = $1 ORDER BY j.created_at DESC LIMIT 30`, [tenant]),
  );

  // Renderer: claim the oldest pending job (or one whose renderer died).
  app.post("/v1/render/claim", { preHandler: renderer }, async (req, reply) => {
    const job = await db.tx(async (q) => {
      const [j] = await q<{ id: string; input: RenderInput; attempts: number }>(
        `SELECT id, input, attempts FROM render_jobs WHERE tenant_id = $1 AND (status = 'pending' OR (status = 'running' AND claimed_at < clock_timestamp() - make_interval(mins => $2::int)))
          ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [tenant, STALE_MINUTES],
      );
      if (!j) return null;
      await q(`UPDATE render_jobs SET status = 'running', claimed_at = clock_timestamp(), attempts = attempts + 1 WHERE id = $1`, [j.id]);
      await audit(q, tenant, { action: "render.started", ...rendererWho(req), resource: { type: "render_job", id: j.id, attempt: j.attempts + 1 } });
      return j;
    });
    if (!job) return reply.status(204).send();
    return { id: job.id, input: job.input, site: config.SITE_URL };
  });

  const running = async (id: string) => {
    const [j] = await db.q<{ status: string; revision_id: string }>(`SELECT status, revision_id FROM render_jobs WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!j) throw notFound("Render job");
    if (j.status !== "running") throw conflict("JOB_STATE", `Render job is ${j.status}`);
    return j;
  };

  // Each image goes through the normal media pipeline (sniffed, re-encoded, scanned).
  app.post("/v1/render/jobs/:id/assets", { preHandler: renderer, bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    const { id } = req.params as { id: string };
    await running(id);
    if (!Buffer.isBuffer(req.body)) throw badRequest("NO_FILE", "Send the image as application/octet-stream");
    const name = String(req.headers["x-filename"] ?? "render.png").replace(/[^\w.-]/g, "_").slice(0, 80);
    const a = await ingest(deps, { buf: req.body, name, actor: RENDERER, request: req.info, allow: ["png", "webp"] });
    return { asset: a.id, width: a.width, height: a.height, url: a.url };
  });

  app.post("/v1/render/jobs/:id/fail", { preHandler: renderer }, async (req) => {
    const { id } = req.params as { id: string };
    const { error } = z.strictObject({ error: z.string().max(2000) }).parse(req.body);
    await running(id);
    await db.tx(async (q) => {
      // Three tries, then it stays failed for an operator to look at.
      const [j] = await q<{ attempts: number }>(`SELECT attempts FROM render_jobs WHERE id = $1`, [id]);
      await q(`UPDATE render_jobs SET status = $2, error = $3, finished_at = CASE WHEN $2 = 'failed' THEN clock_timestamp() END WHERE id = $1`, [id, j!.attempts >= 3 ? "failed" : "pending", error]);
      await audit(q, tenant, { action: "render.failed", result: "failure", ...rendererWho(req), resource: { type: "render_job", id, attempts: j!.attempts }, reason: error.slice(0, 300) });
    });
    return { ok: true };
  });

  // Results go into a new draft revision: only the rendered fields change.
  app.post("/v1/render/jobs/:id/complete", { preHandler: renderer }, async (req) => {
    const { id } = req.params as { id: string };
    const r = Result.parse(req.body);
    await running(id);
    return db.tx(async (q) => {
      const urls = new Map<string, string>();
      const ids = [...r.sizes, ...r.caps, ...(r.uses ? [r.uses] : []), ...Object.values(r.posters ?? {})].map((s) => s.asset);
      const assets = await q<{ id: string; mime: string; uploaded_by: string }>(`SELECT id, mime, uploaded_by FROM assets WHERE id = ANY($1) AND tenant_id = $2`, [ids, tenant]);
      for (const a of assets) if (a.uploaded_by === RENDERER.id) urls.set(a.id, `/media/${a.id}.webp`);
      const img = (s: z.infer<typeof Shot>) => {
        const src = urls.get(s.asset);
        if (!src) throw forbidden("UNKNOWN_ASSET", `${s.asset} was not uploaded by the renderer`);
        return { src, width: s.width, height: s.height };
      };
      const e = await getEntry(q, tenant, RENDER_TYPE, "main", true);
      let data: unknown = (await getRevision(q, e.draft_revision_id!)).data;
      const sizes = (getAt(data, "/data/sizes") as Size[] | undefined) ?? [];
      for (const s of r.sizes) if (sizes.some((x) => x.id === s.id)) data = setAt(data, `/data/sizes[id=${s.id}]/render`, { ...img(s), base: s.base, mouth: s.mouth, left: s.left, right: s.right });
      const variants = (getAt(data, "/data/caps/variants") as { id: string }[] | undefined) ?? [];
      for (const c of r.caps) if (variants.some((v) => v.id === c.id)) data = setAt(data, `/data/caps/variants[id=${c.id}]/image`, img(c));
      if (r.uses) data = setAt(data, "/data/images/uses", img(r.uses));
      // Posters merge: a partial result keeps the existing renders for the shapes it did not redo.
      if (r.posters) data = setAt(data, "/data/images/posters", { ...((getAt(data, "/data/images/posters") as object | undefined) ?? {}), ...Object.fromEntries(Object.entries(r.posters).map(([k, v]) => [k, img(v!)])) });
      const { revision, changes } = await saveDraft(q, tenant, { typeKey: RENDER_TYPE, data, baseRevisionId: null, skipConcurrency: true, actor: RENDERER, request: req.info, note: `3D renders (job ${id})` });
      await q(`UPDATE render_jobs SET status = 'done', finished_at = clock_timestamp(), result = $2, error = NULL WHERE id = $1`, [id, JSON.stringify(r)]);
      await audit(q, tenant, { action: "render.completed", ...rendererWho(req), resource: { type: "render_job", id, revision: revision.id, number: revision.number, images: ids.length, changes: changes.length } });
      return { revision: revision.id, number: revision.number, changes: changes.length };
    });
  });
}
