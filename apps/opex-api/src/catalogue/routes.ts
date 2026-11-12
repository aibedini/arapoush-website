import type { FastifyInstance } from "fastify";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChartCatalogue } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { badRequest, notFound, Problem } from "../http/problem.ts";
import { sha256, ulid } from "../ids.ts";
import { diff } from "../content/diff.ts";
import { getEntry, getRevision, saveDraft, typeOrThrow, validateOrThrow } from "../content/service.ts";
import { recheckOpen } from "../cr/service.ts";
import { CATALOGUE, MAX_CHART_BYTES } from "./contract.ts";
import { importCharts } from "./import.ts";
import { CadRejected, sniffCad } from "./cad.ts";
import { convertInWorker } from "./cadWorker.ts";

export const TUBE_CATALOGUE = "product.tube.catalogue";

type Mount = { axis: string; anchorMm: [number, number, number]; neckDiameterMm: number; thread?: string };
type ModelRow = {
  id: string;
  closure_id: string;
  shape_id: string | null;
  diameter: number | null;
  suggested: unknown;
  source_name: string;
  source_kind: "step" | "glb";
  status: "needs_review" | "approved" | "archived";
  asset_id: string;
  bbox: { min: number[]; max: number[]; size: number[] };
  triangles: number;
  parts: number;
  simplified: boolean;
  mounting: Mount | null;
  created_at: Date;
  approved_at: Date | null;
};
const view = (r: ModelRow) => ({
  id: r.id,
  closure_id: r.closure_id,
  shape: r.shape_id,
  diameter: r.diameter,
  source_name: r.source_name,
  source_kind: r.source_kind,
  status: r.status,
  // Unpublished assets are only readable through the operator route.
  url: `/v1/manage/media/${r.asset_id}.glb/raw`,
  bbox: r.bbox,
  triangles: r.triangles,
  parts: r.parts,
  simplified: r.simplified,
  mounting: r.mounting,
  suggested: r.suggested ?? null,
  created_at: new Date(r.created_at).toISOString(),
  approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
});

/**
 * Tube catalogue tools (T1). The size-chart import previews against the current draft and, when
 * applied, saves a normal draft revision: review, change requests and publishing work as for any
 * other edit.
 */
export async function catalogueModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const write = requireOperator(deps, "operator");
  const read = requireOperator(deps, "viewer");

  const draftOf = async (q: Q, lock = false) => {
    const e = await getEntry(q, tenant, TUBE_CATALOGUE, "main", lock);
    const data = (e.draft_revision_id ? (await getRevision(q, e.draft_revision_id)).data : {}) as ChartCatalogue;
    return { e, data };
  };
  const modelOrThrow = async (q: Q, id: string) => {
    const [m] = await q<ModelRow>(`SELECT * FROM cad_models WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!m) throw notFound("Model");
    return m;
  };

  // Factory CAD → web model (T2). Conversion runs in a worker; the result waits for review.
  app.post("/v1/manage/catalogue/tube/models", { preHandler: write, bodyLimit: 40 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = CATALOGUE.uploadModel.body.parse(req.body);
    const { data } = await draftOf(db.q);
    if (!data.closures?.some((c) => c.id === body.closure)) throw notFound("Closure");
    if ((body.shape === undefined) !== (body.diameter === undefined)) throw badRequest("VALIDATION_FAILED", "Give both shape and diameter, or neither", { issues: [{ path: "/diameter", code: "PAIR", message: "shape and diameter go together" }] });
    if (body.shape !== undefined && !data.shapes?.find((s) => s.id === body.shape)?.sizes?.[String(body.diameter)])
      throw badRequest("VALIDATION_FAILED", "That shape does not offer this diameter", { issues: [{ path: "/diameter", code: "UNKNOWN", message: `${body.shape} has no Ø${body.diameter}` }] });
    const bytes = new Uint8Array(Buffer.from(body.data, "base64"));
    const reject = async (reason: string) => {
      await db.tx((q) => audit(q, tenant, { action: "cad.rejected", result: "failure", actor: actorOf(req), request: req.info, resource: { closure: body.closure, name: body.name.slice(0, 200), bytes: bytes.length }, reason }));
      return badRequest("CAD_REJECTED", reason);
    };
    const kind = sniffCad(bytes);
    if (!kind) throw await reject("Not a STEP (.step/.stp) or GLB file");
    let r;
    try {
      r = await convertInWorker(bytes, { unit: body.unit });
    } catch (e) {
      throw await reject(e instanceof CadRejected ? e.message : "The file could not be converted");
    }
    // The same file uploaded again (another diameter, a duplicate) shares the stored GLB.
    const glbHash = sha256(Buffer.from(r.glb));
    const [same] = await db.q<{ id: string }>(`SELECT id FROM assets WHERE tenant_id = $1 AND sha256 = $2`, [tenant, glbHash]);
    const assetId = same?.id ?? ulid("ast_");
    if (!same) {
      mkdirSync(config.MEDIA_DIR, { recursive: true });
      writeFileSync(path.join(config.MEDIA_DIR, `${assetId}.glb`), r.glb, { mode: 0o640 });
    }
    const id = ulid("cad_");
    const actor = actorOf(req);
    const row = await db.tx(async (q) => {
      if (!same)
        await q(`INSERT INTO assets (id, tenant_id, sha256, mime, bytes, original_name, status, scan, uploaded_by) VALUES ($1,$2,$3,'model/gltf-binary',$4,$5,'clean','converted',$6)`, [
          assetId,
          tenant,
          glbHash,
          r.glb.length,
          body.name.slice(0, 200),
          actor.id,
        ]);
      const [m] = await q<ModelRow>(
        `INSERT INTO cad_models (id, tenant_id, closure_id, shape_id, diameter, source_name, source_kind, source_sha256, asset_id, bbox, triangles, parts, simplified, suggested, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [id, tenant, body.closure, body.shape ?? null, body.diameter ?? null, body.name.slice(0, 200), kind, sha256(Buffer.from(bytes)), assetId, JSON.stringify(r.bbox), r.triangles, r.parts, r.simplified, r.suggested ? JSON.stringify(r.suggested) : null, actor.id],
      );
      await audit(q, tenant, { action: "cad.uploaded", actor, request: req.info, resource: { type: "cad_model", id, closure: body.closure, shape: body.shape, diameter: body.diameter, kind, bytes: bytes.length, glb_bytes: r.glb.length, triangles: r.triangles, suggested: r.suggested?.confidence ?? null } });
      return m!;
    });
    return reply.code(201).send(view(row));
  });

  app.get("/v1/manage/catalogue/tube/models", { preHandler: read }, async (req) => {
    const { closure } = CATALOGUE.listModels.query.parse(req.query);
    const rows = await db.q<ModelRow>(`SELECT * FROM cad_models WHERE tenant_id = $1 AND ($2::text IS NULL OR closure_id = $2) ORDER BY created_at DESC LIMIT 200`, [tenant, closure ?? null]);
    return rows.map(view);
  });

  app.put("/v1/manage/catalogue/tube/models/:id/mounting", { preHandler: write }, async (req) => {
    const { id } = CATALOGUE.mountModel.params.parse(req.params);
    const mounting = CATALOGUE.mountModel.body.parse(req.body);
    return db.tx(async (q) => {
      const m = await modelOrThrow(q, id);
      const [u] = await q<ModelRow>(`UPDATE cad_models SET mounting = $2, status = CASE WHEN status = 'approved' THEN 'needs_review' ELSE status END, updated_at = clock_timestamp() WHERE id = $1 RETURNING *`, [m.id, JSON.stringify(mounting)]);
      await audit(q, tenant, { action: "cad.mounting", actor: actorOf(req), request: req.info, resource: { type: "cad_model", id, closure: m.closure_id, mounting } });
      return view(u!);
    });
  });

  app.post("/v1/manage/catalogue/tube/models/:id/approve", { preHandler: write }, async (req) => {
    const { id } = CATALOGUE.approveModel.params.parse(req.params);
    const body = CATALOGUE.approveModel.body.parse(req.body);
    return db.tx(async (q) => {
      const m = await modelOrThrow(q, id);
      if (!m.mounting) throw badRequest("MOUNTING_REQUIRED", "Set the mounting first: axis, anchor point and neck diameter");
      const { e, data } = await draftOf(q, true);
      if ((body.base_revision_id ?? null) !== e.draft_revision_id) throw new Problem(412, "CONFLICT_BASE_REVISION", "The catalogue changed; reload", { current: e.draft_revision_id });
      const next = structuredClone(data);
      const closure = next.closures.find((c) => c.id === m.closure_id);
      if (!closure) throw notFound("Closure");
      const model3d = { src: `/media/${m.asset_id}.glb`, modelId: m.id, axis: m.mounting.axis, anchorMm: m.mounting.anchorMm, neckDiameterMm: m.mounting.neckDiameterMm, sizeMm: m.bbox.size };
      if (m.shape_id && m.diameter != null) {
        const by = (closure.models3d ??= {}) as Record<string, Record<string, typeof model3d>>;
        (by[m.shape_id] ??= {})[String(m.diameter)] = model3d;
      } else closure.model3d = model3d;
      const where = m.shape_id ? ` at ${m.shape_id} Ø${m.diameter}` : "";
      const saved = await saveDraft(q, tenant, { typeKey: TUBE_CATALOGUE, data: next, baseRevisionId: e.draft_revision_id, actor: actorOf(req), request: req.info, note: `3D model for ${m.closure_id}${where}: ${m.source_name}` });
      await q(
        `UPDATE cad_models SET status = 'archived', updated_at = clock_timestamp() WHERE tenant_id = $1 AND closure_id = $2 AND shape_id IS NOT DISTINCT FROM $4 AND diameter IS NOT DISTINCT FROM $5 AND status = 'approved' AND id <> $3`,
        [tenant, m.closure_id, m.id, m.shape_id, m.diameter],
      );
      const [u] = await q<ModelRow>(`UPDATE cad_models SET status = 'approved', approved_by = $2, approved_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $1 RETURNING *`, [m.id, actorOf(req).id]);
      await audit(q, tenant, { action: "cad.approved", actor: actorOf(req), request: req.info, resource: { type: "cad_model", id, closure: m.closure_id, revision: saved.revision.id } });
      return { model: view(u!), revision: { id: saved.revision.id, number: saved.revision.number } };
    });
  });

  app.post("/v1/manage/catalogue/tube/import", { preHandler: write, bodyLimit: 20 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const body = CATALOGUE.importCharts.body.parse(req.body);
    const files = body.files.map((f) => {
      const bytes = Buffer.from(f.data, "base64");
      if (bytes.length > MAX_CHART_BYTES) throw badRequest("VALIDATION_FAILED", "File too large", { issues: [{ path: `/files/${f.name}`, code: "TOO_LARGE", message: "2 MB at most" }] });
      return { name: f.name, bytes: new Uint8Array(bytes) };
    });
    const t = typeOrThrow(TUBE_CATALOGUE);

    return db.tx(async (q) => {
      const e = await getEntry(q, tenant, TUBE_CATALOGUE, "main", body.apply);
      const current = e.draft_revision_id ? (await getRevision(q, e.draft_revision_id)).data : {};
      if (body.apply && (body.base_revision_id ?? null) !== e.draft_revision_id) throw new Problem(412, "CONFLICT_BASE_REVISION", "The catalogue changed since the preview; preview again", { current: e.draft_revision_id });

      const r = importCharts(current as ChartCatalogue, files, { keepMissing: body.keep_missing });
      if (!r.charts.some((c) => c.shape)) throw badRequest("NO_CHART", "No file could be read as a size chart", { warnings: r.warnings.slice(0, 50) });
      const next = { ...r.catalogue, updated: new Date().toISOString().slice(0, 10) };
      validateOrThrow(t, next);
      const changes = diff(current, next).filter((c) => c.path !== "/updated");
      const summary = { charts: r.charts, warnings: r.warnings, added: r.added, changes: changes.slice(0, 2000), base_revision_id: e.draft_revision_id };
      if (!body.apply || !changes.length) return { ...summary, revision: null };

      const saved = await saveDraft(q, tenant, { typeKey: TUBE_CATALOGUE, data: next, baseRevisionId: e.draft_revision_id, actor: actorOf(req), request: req.info, note: body.note ?? `Size charts: ${r.charts.map((c) => c.file).join(", ")}` });
      await recheckOpen(q, tenant, TUBE_CATALOGUE, { actor: actorOf(req), request: req.info });
      return { ...summary, revision: { id: saved.revision.id, number: saved.revision.number } };
    });
  });
}
