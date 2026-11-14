import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { audit } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { enqueueWebhook } from "../webhooks/outbox.ts";
import { SECTIONS, SETTINGS } from "./contract.ts";
import { crawlBase, headerStatus, loadSettings, sslStatus } from "./service.ts";
import { systemOverview } from "./overview.ts";

/** S3: site settings (analytics, verification, indexing, security contact) and live SSL/header status. */
export async function settingsModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;

  app.get("/v1/manage/settings", { preHandler: requireOperator(deps) }, async () => {
    const { settings, updated } = await loadSettings(db.q, tenant);
    const [ssl, headers] = await Promise.all([sslStatus(config.SITE_URL), headerStatus(`${crawlBase(config)}/fa`)]);
    return {
      ...settings,
      updated,
      status: {
        ssl,
        headers,
        env: { siteUrl: config.SITE_URL, publicUrl: config.PUBLIC_URL, consoleAllowlist: config.consoleCidrs, turnstile: !!config.TURNSTILE_SECRET, mail: !!config.SMTP_URL, clamav: !!config.CLAMAV },
      },
    };
  });

  // Overview: service health, memory, disk, storage per area, queues and best-practice checks.
  app.get("/v1/manage/system/overview", { preHandler: requireOperator(deps), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { fresh } = SETTINGS.overview.query.parse(req.query);
    return systemOverview(deps, fresh === "1");
  });

  app.put("/v1/manage/settings/:section", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const { section } = SETTINGS.put.params.parse(req.params);
    const data = SECTIONS[section].parse(req.body ?? {});
    await db.tx(async (q) => {
      const [before] = await q<{ data: unknown }>(`SELECT data FROM site_settings WHERE tenant_id = $1 AND section = $2`, [tenant, section]);
      await q(
        `INSERT INTO site_settings (tenant_id, section, data, updated_by) VALUES ($1,$2,$3::jsonb,$4)
         ON CONFLICT (tenant_id, section) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = clock_timestamp()`,
        [tenant, section, JSON.stringify(data), req.principal!.id],
      );
      await audit(q, tenant, { action: "settings.update", actor: actorOf(req), request: req.info, resource: { type: "settings", id: section }, changes: [{ op: "replace", path: `/${section}`, old: before?.data ?? null, new: data }] });
      // The website reads settings with its content bundle: tell it to refresh.
      await enqueueWebhook(q, tenant, "site", "content.published", { type: "settings", section });
    });
    return { ok: true };
  });
}
