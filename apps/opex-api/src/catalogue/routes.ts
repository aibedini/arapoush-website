import type { FastifyInstance } from "fastify";
import type { ChartCatalogue } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, Problem } from "../http/problem.ts";
import { diff } from "../content/diff.ts";
import { getEntry, getRevision, saveDraft, typeOrThrow, validateOrThrow } from "../content/service.ts";
import { recheckOpen } from "../cr/service.ts";
import { CATALOGUE, MAX_CHART_BYTES } from "./contract.ts";
import { importCharts } from "./import.ts";

export const TUBE_CATALOGUE = "product.tube.catalogue";

/**
 * Tube catalogue tools (T1). The size-chart import previews against the current draft and, when
 * applied, saves a normal draft revision: review, change requests and publishing work as for any
 * other edit.
 */
export async function catalogueModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const write = requireOperator(deps, "operator");

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
