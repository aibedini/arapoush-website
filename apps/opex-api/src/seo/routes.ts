import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { conflict, notFound } from "../http/problem.ts";
import { ulid } from "../ids.ts";
import { crawlBase, loadSettings } from "../settings/service.ts";
import type { Job } from "../workers.ts";
import { SEO } from "./contract.ts";
import { runSeo } from "./engine.ts";

let running = false;

/** Starts one crawl in the background and stores its report. */
export async function startSeo(deps: Deps, trigger: "manual" | "schedule" | "publish", by: string | null, log?: FastifyBaseLogger): Promise<string> {
  if (running) throw conflict("SEO_RUNNING", "A check is already running");
  running = true;
  const { db, config } = deps;
  const id = ulid("seo_");
  const base = crawlBase(config);
  await db.q(`INSERT INTO seo_reports (id, tenant_id, trigger, base_url, started_by) VALUES ($1,$2,$3,$4,$5)`, [id, config.TENANT, trigger, config.SITE_URL, by]);
  void (async () => {
    try {
      const { settings } = await loadSettings(db.q, config.TENANT);
      const r = await runSeo({ base, publicBase: config.SITE_URL.replace(/\/$/, ""), indexing: settings.seo.indexing, extra: settings.seo.pages });
      await db.q(`UPDATE seo_reports SET status = 'done', score = $2, summary = $3::jsonb, pages = $4::jsonb, finished_at = clock_timestamp() WHERE id = $1`, [id, r.score, JSON.stringify({ categories: r.categories, site: r.site, counts: r.counts }), JSON.stringify(r.pages)]);
    } catch (e) {
      log?.warn({ err: e }, "seo run failed");
      await db.q(`UPDATE seo_reports SET status = 'failed', error = $2, finished_at = clock_timestamp() WHERE id = $1`, [id, (e as Error).message.slice(0, 500)]);
    } finally {
      running = false;
    }
  })();
  return id;
}

/** S5: the automatic SEO / GEO / AIO / SXO checks of the live site. */
export async function seoModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const row = `id, trigger, status, base_url, score, summary->'counts' AS counts, error, created_at, finished_at`;

  app.get("/v1/manage/seo/reports", { preHandler: requireOperator(deps) }, async () => db.q(`SELECT ${row} FROM seo_reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 60`, [tenant]));

  app.get("/v1/manage/seo/reports/:id", { preHandler: requireOperator(deps) }, async (req) => {
    const { id } = SEO.get.params.parse(req.params);
    const [r] = await db.q<Record<string, unknown> & { summary: { categories?: unknown; site?: unknown }; pages: unknown }>(`SELECT ${row}, summary, pages FROM seo_reports WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!r) throw notFound("Report");
    const { summary, ...rest } = r;
    return { ...rest, categories: summary?.categories ?? {}, site: summary?.site ?? [], pages: r.pages ?? [] };
  });

  app.post("/v1/manage/seo/run", { preHandler: requireOperator(deps, "operator"), config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req) => {
    const id = await startSeo(deps, "manual", req.principal!.id, req.log);
    await auditNow(db, tenant, { action: "seo.run", actor: actorOf(req), request: req.info, resource: { type: "seo_report", id } });
    return { id };
  });
}

/** Scheduled checks (daily / weekly) and a check a few minutes after content is published. */
export const scheduledSeo: Job = {
  name: "seo.schedule",
  everyMs: 5 * 60_000,
  run: async (deps, log) => {
    if (running || deps.config.NODE_ENV === "test") return;
    const { db, config } = deps;
    const { settings } = await loadSettings(db.q, config.TENANT);
    const [last] = await db.q<{ created_at: Date }>(`SELECT created_at FROM seo_reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`, [config.TENANT]);
    const lastAt = last ? new Date(last.created_at).getTime() : 0;
    const gap = settings.seo.schedule === "daily" ? 86_400_000 : settings.seo.schedule === "weekly" ? 7 * 86_400_000 : Infinity;
    if (Date.now() - lastAt >= gap) {
      await startSeo(deps, "schedule", null, log);
      return;
    }
    if (!settings.seo.afterPublish) return;
    const [pub] = await db.q<{ at: Date }>(`SELECT max(created_at) AS at FROM publications WHERE tenant_id = $1`, [config.TENANT]);
    const pubAt = pub?.at ? new Date(pub.at).getTime() : 0;
    // Published since the last check, and the site has had a few minutes to revalidate.
    if (pubAt > lastAt && Date.now() - pubAt > 3 * 60_000) await startSeo(deps, "publish", null, log);
  },
};
