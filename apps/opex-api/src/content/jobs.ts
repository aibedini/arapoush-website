import type { Job } from "../workers.ts";
import { SYSTEM_ACTOR, SYSTEM_REQUEST } from "../audit/audit.ts";
import { deliverPending } from "../webhooks/outbox.ts";
import { publish } from "./service.ts";
import { expireIdle } from "../cr/service.ts";

/** Publishes entries whose schedule has come due (idempotent: the schedule is cleared on publish). */
export const scheduledPublish: Job = {
  name: "scheduled-publish",
  everyMs: 30_000,
  async run({ db, config }) {
    const due = await db.q<{ type_key: string }>(`SELECT type_key FROM entries WHERE tenant_id = $1 AND scheduled_at IS NOT NULL AND scheduled_at <= clock_timestamp()`, [config.TENANT]);
    for (const e of due) await db.tx((q) => publish(q, config.TENANT, { typeKey: e.type_key, actor: { ...SYSTEM_ACTOR, display: "Scheduler" }, request: SYSTEM_REQUEST, trigger: "schedule" }));
  },
};

export const siteWebhooks: Job = { name: "webhooks", everyMs: 5_000, run: (deps, log) => deliverPending(deps, log) };

/** Change requests idle for 30 days expire (plan §7.2). */
export const crExpiry: Job = { name: "cr-expiry", everyMs: 3_600_000, run: ({ db, config }) => db.tx((q) => expireIdle(q, config.TENANT, SYSTEM_REQUEST)).then(() => undefined) };

import { deliverEmails, purgeOld } from "../inquiries/routes.ts";
/** Inquiry emails to sales, and the two-year retention purge. */
export const inquiryEmails: Job = { name: "inquiry-emails", everyMs: 15_000, run: (deps, log) => deliverEmails(deps, log) };
export const inquiryRetention: Job = { name: "inquiry-retention", everyMs: 6 * 3_600_000, run: (deps) => purgeOld(deps) };

import { exportArchive } from "../audit/archive.ts";
/** Hourly write-once audit archive, when AUDIT_ARCHIVE_DIR is set. */
export const auditArchive: Job = { name: "audit-archive", everyMs: 3_600_000, run: async (deps) => void (deps.config.AUDIT_ARCHIVE_DIR && (await exportArchive(deps, deps.config.AUDIT_ARCHIVE_DIR))) };
