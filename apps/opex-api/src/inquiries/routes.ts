import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit, auditNow, SYSTEM_REQUEST } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { forbidden, notFound, Problem, unauthorized } from "../http/problem.ts";
import { safeEqual, ulid } from "../ids.ts";
import { inquiryKeys } from "./crypto.ts";

export const FORMS = ["quote", "contact"] as const;
const RETENTION_DAYS = 730;
const PER_IP = { max: 5, minutes: 10 };

// Text from visitors: no control characters (except newlines and tabs) and no bidi overrides.
const clean = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.normalize("NFC").replace(/[‪-‮⁦-⁩]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim());
const Email = z.string().max(200).regex(/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/, "invalid email");

export const InquiryInput = z.strictObject({
  locale: z.enum(["fa", "en", "tr"]),
  page: z.string().regex(/^\/[\w\-/]*$/).max(200),
  subject: clean(300),
  spec: z.array(clean(300)).max(30).default([]),
  fields: z.strictObject({
    name: clean(120).refine((s) => s.length > 0, "required"),
    email: Email,
    company: clean(160).optional(),
    phone: clean(40).optional(),
    mobile: clean(40).optional(),
    quantity: clean(60).optional(),
    message: clean(4000).optional(),
  }),
  turnstile: z.string().max(4000).optional(),
});
export type Inquiry = z.infer<typeof InquiryInput>;

async function turnstileOk(secret: string, token: string | undefined, ip: string | null) {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/**
 * Website forms (plan §10.4). The site's server forwards a visitor's quote or contact request; OPEX
 * stores it encrypted, emails sales and records it in the audit log without personal data. Operators
 * read inquiries in the console; every read is audited. Kept for two years.
 */
export async function inquiryModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const keys = inquiryKeys(config);
  const site = (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };

  app.post("/v1/delivery/forms/:form", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    site(req);
    const { form } = z.object({ form: z.enum(FORMS) }).parse(req.params);
    const body = InquiryInput.parse(req.body);
    const ip = req.info.asserted_end_user_ip ?? null;
    if (config.TURNSTILE_SECRET && !(await turnstileOk(config.TURNSTILE_SECRET, body.turnstile, ip))) throw forbidden("CHALLENGE_FAILED", "The anti-spam check failed");
    if (ip) {
      const [{ n }] = (await db.q<{ n: number }>(`SELECT count(*)::int AS n FROM inquiries WHERE tenant_id = $1 AND ip = $2 AND created_at > clock_timestamp() - make_interval(mins => $3::int)`, [tenant, ip, PER_IP.minutes])) as [{ n: number }];
      if (n >= PER_IP.max) throw new Problem(429, "TOO_MANY_INQUIRIES", "Too many requests from this address; try again later");
    }
    const id = ulid("inq_");
    const { turnstile: _t, ...stored } = body;
    const enc = keys.encrypt(id, stored);
    const summary = { form, locale: body.locale, page: body.page, subject: body.subject.slice(0, 200), items: body.spec.length };
    await db.tx(async (q) => {
      await q(`INSERT INTO inquiries (id, tenant_id, form, payload_enc, key_id, summary, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, tenant, form, enc.payload, enc.keyId, JSON.stringify(summary), ip]);
      await q(`INSERT INTO email_outbox (id, tenant_id, inquiry_id, to_address) VALUES ($1,$2,$3,$4)`, [ulid("eml_"), tenant, id, config.INQUIRY_TO]);
      // No personal data in the audit log: the encrypted row holds it.
      await audit(q, tenant, { action: "inquiry.received", actor: { kind: "anonymous", id: null, display: "Website visitor" }, request: req.info, resource: { type: "inquiry", id, ...summary } });
    });
    reply.status(201);
    return { id };
  });

  const read = requireOperator(deps, "operator");
  const open = (r: { id: string; key_id: string; payload_enc: string }) => keys.decrypt<Omit<Inquiry, "turnstile">>(r.id, r.key_id, r.payload_enc);

  app.get("/v1/manage/inquiries", { preHandler: read }, async (req) => {
    const { handled } = z.object({ handled: z.enum(["0", "1"]).optional() }).parse(req.query);
    const rows = await db.q<{ id: string; form: string; key_id: string; payload_enc: string; summary: Record<string, unknown>; created_at: Date; handled_at: Date | null; handled_by: string | null }>(
      `SELECT i.id, i.form, i.key_id, i.payload_enc, i.summary, i.created_at, i.handled_at, p.display_name AS handled_by FROM inquiries i LEFT JOIN principals p ON p.id = i.handled_by
        WHERE i.tenant_id = $1 ${handled === "1" ? "AND i.handled_at IS NOT NULL" : handled === "0" ? "AND i.handled_at IS NULL" : ""} ORDER BY i.created_at DESC LIMIT 200`,
      [tenant],
    );
    await auditNow(db, tenant, { action: "inquiry.list", actor: actorOf(req), request: req.info, resource: { type: "inquiry", count: rows.length, ids: rows.map((r) => r.id).slice(0, 200) } });
    return rows.map((r) => {
      const d = open(r);
      return { id: r.id, form: r.form, created_at: r.created_at, handled_at: r.handled_at, handled_by: r.handled_by, summary: r.summary, name: d.fields.name, email: d.fields.email, company: d.fields.company ?? null };
    });
  });

  app.get("/v1/manage/inquiries/:id", { preHandler: read }, async (req) => {
    const { id } = req.params as { id: string };
    const [r] = await db.q<{ id: string; form: string; key_id: string; payload_enc: string; summary: unknown; ip: string | null; created_at: Date; handled_at: Date | null }>(`SELECT * FROM inquiries WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!r) throw notFound("Inquiry");
    await auditNow(db, tenant, { action: "inquiry.read", actor: actorOf(req), request: req.info, resource: { type: "inquiry", id } });
    const emails = await db.q(`SELECT status, attempt, last_error, created_at FROM email_outbox WHERE inquiry_id = $1`, [id]);
    return { id: r.id, form: r.form, created_at: r.created_at, handled_at: r.handled_at, ip: r.ip, summary: r.summary, data: open(r), emails };
  });

  app.post("/v1/manage/inquiries/:id/handled", { preHandler: read }, async (req) => {
    const { id } = req.params as { id: string };
    const { handled } = z.strictObject({ handled: z.boolean() }).parse(req.body);
    await db.tx(async (q) => {
      const [r] = await q(`UPDATE inquiries SET handled_at = $3, handled_by = $4 WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant, handled ? new Date() : null, handled ? req.principal!.id : null]);
      if (!r) throw notFound("Inquiry");
      await audit(q, tenant, { action: handled ? "inquiry.handled" : "inquiry.reopened", actor: actorOf(req), request: req.info, resource: { type: "inquiry", id } });
    });
    return { ok: true };
  });

  // Erasure on request (privacy): super admin with step-up; the audit row keeps that it existed.
  app.delete("/v1/manage/inquiries/:id", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const { id } = req.params as { id: string };
    const { reason } = z.strictObject({ reason: z.string().min(3).max(300) }).parse(req.body ?? {});
    await db.tx(async (q) => {
      const [r] = await q(`DELETE FROM inquiries WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant]);
      if (!r) throw notFound("Inquiry");
      await audit(q, tenant, { action: "inquiry.erased", actor: actorOf(req), request: req.info, resource: { type: "inquiry", id }, reason });
    });
    return { ok: true };
  });
}

const MAX_EMAIL_ATTEMPTS = 12;

/** Sends queued inquiry emails (at least once, backoff 1 min … 6 h). The body is decrypted only here. */
export async function deliverEmails(deps: Deps, log: FastifyBaseLogger, transport?: Transporter) {
  const { db, config } = deps;
  if (!transport && !config.SMTP_URL) return;
  const mailer = transport ?? nodemailer.createTransport(config.SMTP_URL!);
  const keys = inquiryKeys(config);
  const due = await db.q<{ id: string; to_address: string; attempt: number; inquiry_id: string; form: string; key_id: string; payload_enc: string; created_at: Date }>(
    `SELECT o.id, o.to_address, o.attempt, i.id AS inquiry_id, i.form, i.key_id, i.payload_enc, i.created_at FROM email_outbox o JOIN inquiries i ON i.id = o.inquiry_id
      WHERE o.tenant_id = $1 AND o.status = 'pending' AND o.next_attempt_at <= clock_timestamp() ORDER BY o.created_at LIMIT 20`,
    [config.TENANT],
  );
  for (const m of due) {
    let error: string | null = null;
    try {
      const d = keys.decrypt<Omit<Inquiry, "turnstile">>(m.inquiry_id, m.key_id, m.payload_enc);
      const f = d.fields;
      const lines = [
        d.subject,
        "",
        ...d.spec,
        "",
        ...([["Name", f.name], ["Company", f.company], ["Email", f.email], ["Phone", f.phone ?? f.mobile], ["Quantity", f.quantity]] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
        ...(f.message ? ["", f.message] : []),
        "",
        `Page: ${d.page} (${d.locale})`,
        `OPEX inquiry ${m.inquiry_id}`,
      ];
      // Subject and reply-to come from validated fields; no header can be injected (no CR/LF allowed).
      await mailer.sendMail({ from: config.MAIL_FROM, to: m.to_address, replyTo: f.email, subject: `[${m.form}] ${d.subject}`.replace(/[\r\n]+/g, " ").slice(0, 200), text: lines.join("\n") });
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    const attempt = m.attempt + 1;
    await db.q(`UPDATE email_outbox SET attempt = $2, last_error = $3, status = $4, next_attempt_at = clock_timestamp() + make_interval(mins => $5::int) WHERE id = $1`, [
      m.id,
      attempt,
      error,
      error ? (attempt >= MAX_EMAIL_ATTEMPTS ? "dead" : "pending") : "sent",
      Math.min(360, 2 ** Math.min(attempt, 9)),
    ]);
    if (error) log.warn({ id: m.id, attempt, error }, "inquiry email not sent");
  }
}

/** Inquiries older than two years are deleted (plan §15 retention); the purge itself is audited. */
export async function purgeOld(deps: Deps) {
  const { db, config } = deps;
  await db.tx(async (q) => {
    const rows = await q<{ id: string }>(`DELETE FROM inquiries WHERE tenant_id = $1 AND created_at < clock_timestamp() - make_interval(days => $2::int) RETURNING id`, [config.TENANT, RETENTION_DAYS]);
    if (rows.length) await audit(q, config.TENANT, { action: "inquiry.purged", actor: { kind: "system", id: "retention", display: "Retention" }, request: SYSTEM_REQUEST, resource: { type: "inquiry", count: rows.length, days: RETENTION_DAYS } });
  });
}

