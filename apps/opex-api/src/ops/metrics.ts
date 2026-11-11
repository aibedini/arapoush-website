import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { verifyChain } from "../audit/audit.ts";
import { notFound, unauthorized } from "../http/problem.ts";
import { safeEqual } from "../ids.ts";

/**
 * Prometheus metrics for alerting (docs/opex/runbooks/alerts.md). Bearer METRICS_TOKEN; off when unset.
 * Values are counts from the database, so every API instance reports the same numbers.
 */
export async function metricsModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  app.get("/metrics", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!config.METRICS_TOKEN) throw notFound();
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), config.METRICS_TOKEN)) throw unauthorized();
    const t = config.TENANT;
    const one = async (sql: string) => Number(Object.values((await db.q<Record<string, number>>(sql, [t]))[0] ?? { v: 0 })[0] ?? 0);
    const [head] = await db.q<{ seq: string; age: number }>(`SELECT seq::text, extract(epoch FROM clock_timestamp() - ts)::int AS age FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`, [t]);
    const recentFrom = Math.max(1, Number(head?.seq ?? 1) - 1000);
    const chain = await verifyChain(db, t, recentFrom);
    const g: [string, string, number][] = [
      ["opex_up", "1 when the API answers", 1],
      ["opex_audit_chain_ok", "1 when the last 1000 audit rows verify", chain.ok ? 1 : 0],
      ["opex_audit_head_age_seconds", "Seconds since the newest audit row", head?.age ?? 0],
      ["opex_cr_pending_review", "Change requests waiting for review", await one(`SELECT count(*)::int FROM change_requests WHERE tenant_id = $1 AND state = 'pending_review'`)],
      ["opex_cr_needs_rebase", "Change requests waiting for AraCMS to rebase", await one(`SELECT count(*)::int FROM change_requests WHERE tenant_id = $1 AND state = 'needs_rebase'`)],
      ["opex_webhooks_pending", "Webhook deliveries waiting (incl. retries)", await one(`SELECT count(*)::int FROM webhook_deliveries WHERE tenant_id = $1 AND status = 'pending'`)],
      ["opex_webhooks_dead", "Webhook deliveries that gave up", await one(`SELECT count(*)::int FROM webhook_deliveries WHERE tenant_id = $1 AND status = 'dead'`)],
      ["opex_emails_pending", "Inquiry emails waiting", await one(`SELECT count(*)::int FROM email_outbox WHERE tenant_id = $1 AND status = 'pending'`)],
      ["opex_emails_dead", "Inquiry emails that gave up", await one(`SELECT count(*)::int FROM email_outbox WHERE tenant_id = $1 AND status = 'dead'`)],
      ["opex_tickets_open", "Helpdesk tickets not yet resolved", await one(`SELECT count(*)::int FROM tickets WHERE tenant_id = $1 AND status IN ('new','open','pending','on_hold')`)],
      ["opex_tickets_sla_breached", "Open tickets past their SLA target", await one(`SELECT count(*)::int FROM tickets WHERE tenant_id = $1 AND status IN ('new','open','pending','on_hold') AND sla_breached`)],
      ["opex_email_dead", "Emails that could not be sent after all retries", await one(`SELECT count(*)::int FROM email_outbox WHERE tenant_id = $1 AND status = 'dead'`)],
      ["opex_failed_logins_1h", "Failed sign-ins in the last hour", await one(`SELECT count(*)::int FROM audit_events WHERE tenant_id = $1 AND result = 'failure' AND action LIKE '%login.failure' AND ts > clock_timestamp() - interval '1 hour'`)],
      ["opex_denied_1h", "Denied requests in the last hour", await one(`SELECT count(*)::int FROM audit_events WHERE tenant_id = $1 AND result = 'denied' AND ts > clock_timestamp() - interval '1 hour'`)],
      ["opex_refresh_reuse_24h", "Refresh-token reuse (stolen token) in 24 h", await one(`SELECT count(*)::int FROM audit_events WHERE tenant_id = $1 AND action = 'oauth.refresh.reuse_detected' AND ts > clock_timestamp() - interval '24 hours'`)],
    ];
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return g.map(([n, h, v]) => `# HELP ${n} ${h}\n# TYPE ${n} gauge\n${n} ${v}`).join("\n") + "\n";
  });
}
