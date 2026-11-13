import { assertPublicUrl } from "../net/ssrf.ts";
import { createHmac } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../app.ts";
import type { Q } from "../db/index.ts";
import { ulid } from "../ids.ts";

/**
 * Outbound webhooks through a transactional outbox: the event row is written in the same
 * transaction as the change, then a job delivers it (at least once) with an HMAC signature,
 * retrying with exponential backoff (1 min … 6 h, 24 attempts) before giving up (dead letter).
 *
 * Targets: `site` (the website's revalidation hook) and `partner:<partner id>` (AraCMS).
 */
export async function enqueueWebhook(q: Q, tenant: string, target: string, event: string, data: Record<string, unknown>) {
  const id = ulid("evt_");
  await q(`INSERT INTO webhook_deliveries (id, tenant_id, target, event, payload) VALUES ($1,$2,$3,$4,$5)`, [id, tenant, target, event, JSON.stringify({ id, event, data, created: new Date().toISOString() })]);
  return id;
}

/** content.published goes to the website and to every partner with a webhook endpoint. */
export async function enqueueSiteWebhook(q: Q, tenant: string, event: string, data: Record<string, unknown>) {
  const id = await enqueueWebhook(q, tenant, "site", event, data);
  const partners = await q<{ id: string }>(`SELECT id FROM partner_clients WHERE tenant_id = $1 AND status = 'active' AND webhook_url IS NOT NULL`, [tenant]);
  for (const p of partners) await enqueueWebhook(q, tenant, `partner:${p.id}`, event, data);
  return id;
}

/** `OPEX-Signature: t=<unix>, v1=<hex HMAC-SHA256(secret, t + "." + body)>` */
export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t}, v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

const MAX_ATTEMPTS = 24;

export async function deliverPending(deps: Deps, log: FastifyBaseLogger, fetchImpl: typeof fetch = fetch) {
  const { db, config } = deps;
  const due = await db.q<{ id: string; target: string; payload: unknown; attempt: number; url: string | null; secret: string | null }>(
    `SELECT d.id, d.target, d.payload, d.attempt, c.webhook_url AS url, c.webhook_secret AS secret
       FROM webhook_deliveries d LEFT JOIN partner_clients c ON d.target = 'partner:' || c.id
      WHERE d.tenant_id = $1 AND d.status = 'pending' AND d.next_attempt_at <= clock_timestamp() ORDER BY d.created_at LIMIT 50`,
    [config.TENANT],
  );
  for (const d of due) {
    const url = d.target === "site" ? config.SITE_WEBHOOK_URL : d.url;
    const secret = d.target === "site" ? config.SITE_WEBHOOK_SECRET : d.secret;
    if (!url || !secret) continue; // endpoint not configured (yet): keep the event pending
    const body = JSON.stringify(d.payload);
    let code = 0;
    let error: string | null = null;
    try {
      // Partner endpoints are re-checked on every delivery (DNS can change after it was saved, S2).
      if (d.target !== "site" && config.isProd) await assertPublicUrl(url);
      const res = await fetchImpl(url, { method: "POST", redirect: "error", headers: { "content-type": "application/json", "opex-signature": sign(secret, body) }, body, signal: AbortSignal.timeout(10_000) });
      code = res.status;
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    const ok = code >= 200 && code < 300;
    const attempt = d.attempt + 1;
    const delayMin = Math.min(360, 2 ** Math.min(attempt, 9));
    await db.q(
      `UPDATE webhook_deliveries SET attempt = $2, last_code = $3, last_error = $4, status = $5, next_attempt_at = clock_timestamp() + make_interval(mins => $6::int) WHERE id = $1`,
      [d.id, attempt, code || null, error, ok ? "delivered" : attempt >= MAX_ATTEMPTS ? "dead" : "pending", delayMin],
    );
    if (!ok) log.warn({ id: d.id, target: d.target, code, error, attempt }, "webhook not delivered");
  }
}
