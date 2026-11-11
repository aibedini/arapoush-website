import type { FastifyBaseLogger } from "fastify";
import nodemailer, { type Transporter } from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";
import type { Deps } from "../app.ts";
import { audit, SYSTEM_REQUEST } from "../audit/audit.ts";
import { cleanText } from "@arapoush/schema";
import { ulid } from "../ids.ts";
import { MIME, sniff } from "../media/inspect.ts";
import { clamScan } from "../media/inspect.ts";
import { addEvent, createTicket, notify, OPEN_STATUSES, openTicket, pii, teamLeads, teamMembers, type OutMail, type Status } from "./service.ts";

const MAX_ATTEMPTS = 12;

/** Sends queued emails (at least once, backoff 1 min … 6 h). The message is decrypted only here. */
export async function deliverOutbox(deps: Deps, log: FastifyBaseLogger, transport?: Pick<Transporter, "sendMail">) {
  const { db, config } = deps;
  if (!transport && !config.SMTP_URL) return;
  const mailer = transport ?? nodemailer.createTransport(config.SMTP_URL!);
  const keys = pii(config);
  const due = await db.q<{ id: string; attempt: number; message_enc: string; key_id: string }>(
    `SELECT id, attempt, message_enc, key_id FROM email_outbox WHERE tenant_id = $1 AND status = 'pending' AND message_enc IS NOT NULL AND next_attempt_at <= clock_timestamp() ORDER BY created_at LIMIT 20`,
    [config.TENANT],
  );
  for (const m of due) {
    let error: string | null = null;
    try {
      const msg = keys.decrypt<OutMail>(m.id, m.key_id, m.message_enc);
      // Subjects and addresses come from validated values; CR/LF never reach a header.
      const one = (s: string | undefined) => s?.replace(/[\r\n]+/g, " ");
      await mailer.sendMail({
        from: one(msg.from) ?? config.MAIL_FROM,
        to: one(msg.to)!,
        replyTo: one(msg.replyTo),
        subject: one(msg.subject)!,
        text: msg.text,
        html: msg.html,
        messageId: one(msg.messageId),
        inReplyTo: one(msg.inReplyTo),
        references: msg.references?.map((r) => r.replace(/[\r\n\s]+/g, "")),
        headers: msg.kind === "reply" || msg.kind === "confirmation" ? { "Auto-Submitted": msg.kind === "confirmation" ? "auto-replied" : "no" } : { "Auto-Submitted": "auto-generated" },
      });
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    const attempt = m.attempt + 1;
    await db.q(`UPDATE email_outbox SET attempt = $2, last_error = $3, status = $4, next_attempt_at = clock_timestamp() + make_interval(mins => $5::int) WHERE id = $1`, [m.id, attempt, error, error ? (attempt >= MAX_ATTEMPTS ? "dead" : "pending") : "sent", Math.min(360, 2 ** Math.min(attempt, 9))]);
    if (error) log.warn({ id: m.id, attempt, error }, "email not sent");
  }
}

/** The new part of a reply: quoted history and the "On … wrote:" line are cut (best effort). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((l, i) =>
    /^\s*>/.test(l) && lines.slice(i).every((x) => /^\s*(>|$)/.test(x)) ||
    /^-{2,}\s*Original Message\s*-{2,}/i.test(l) ||
    /^On .{4,200} wrote:\s*$/i.test(l) ||
    /^در تاریخ .{2,200} نوشت:?\s*$/.test(l) ||
    /^.{4,200} tarihinde .{0,200} yazdı:\s*$/i.test(l) ||
    /^_{10,}$/.test(l) ||
    /^From: .+$/i.test(l) && /^(Sent|Date|To|Subject):/i.test(lines[i + 1] ?? ""),
  );
  const body = (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
  return body.replace(/\n-- \n[\s\S]*$/, "").trim();
}

const addressOf = (m: ParsedMail) => (m.from?.value?.[0]?.address ?? "").toLowerCase();
const nameOf = (m: ParsedMail) => m.from?.value?.[0]?.name ?? "";

/**
 * One inbound email → the ticket it answers (Message-ID chain, then "[#n]" from the same sender), or
 * a new email ticket. Auto-replies and bounces are dropped; blocked senders are ignored.
 */
export async function handleInbound(deps: Deps, raw: Buffer, log?: FastifyBaseLogger): Promise<{ ticket: number | null; created: boolean; skipped?: string }> {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const keys = pii(config);
  const m = await simpleParser(raw, { skipHtmlToText: false, skipTextToHtml: true });
  const from = addressOf(m);
  const auto = String(m.headers.get("auto-submitted") ?? "no").toLowerCase();
  const prec = String(m.headers.get("precedence") ?? "").toLowerCase();
  if (!from || auto !== "no" || ["bulk", "junk", "list", "auto_reply"].includes(prec) || m.headers.has("x-autoreply") || /^(mailer-daemon|postmaster|no-?reply)@/i.test(from)) return { ticket: null, created: false, skipped: "automatic" };
  if (from === config.SUPPORT_ADDRESS.toLowerCase()) return { ticket: null, created: false, skipped: "loop" };
  const hash = keys.hashEmail(from);
  if ((await db.q(`SELECT 1 FROM sender_blocks WHERE tenant_id = $1 AND hash = $2 AND until > clock_timestamp()`, [tenant, hash])).length) return { ticket: null, created: false, skipped: "blocked" };
  const messageId = (m.messageId ?? `<in.${ulid()}@${config.SUPPORT_ADDRESS.split("@")[1]}>`).slice(0, 300);
  if ((await db.q(`SELECT 1 FROM ticket_events WHERE tenant_id = $1 AND message_id = $2`, [tenant, messageId])).length) return { ticket: null, created: false, skipped: "duplicate" };

  const refs = [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? [m.references] : [])].filter(Boolean) as string[];
  type T = { id: string; number: number; status: Status; team_id: string | null; assignee_id: string | null; requester_hash: string | null; merged_into: string | null };
  let [t] = refs.length ? await db.q<T>(`SELECT t.id, t.number, t.status, t.team_id, t.assignee_id, t.requester_hash, t.merged_into FROM ticket_events e JOIN tickets t ON t.id = e.ticket_id WHERE e.tenant_id = $1 AND e.message_id = ANY($2) ORDER BY e.created_at DESC LIMIT 1`, [tenant, refs]) : [];
  const tag = /\[#(\d{3,9})\]/.exec(m.subject ?? "")?.[1];
  // A "[#n]" in the subject is trusted only from the ticket's own requester.
  if (!t && tag) [t] = await db.q<T>(`SELECT id, number, status, team_id, assignee_id, requester_hash, merged_into FROM tickets WHERE tenant_id = $1 AND number = $2 AND requester_hash = $3`, [tenant, Number(tag), hash]);
  if (t?.merged_into) [t] = await db.q<T>(`SELECT id, number, status, team_id, assignee_id, requester_hash, merged_into FROM tickets WHERE id = $1`, [t.merged_into]);

  const text = cleanText(m.text ?? "").slice(0, 50_000);
  const body = { text: stripQuoted(text) || text.slice(0, 5000), full: text, subject: m.subject ?? "", from: { name: nameOf(m), email: from } };
  const files: { name: string; mime: string; buf: Buffer; scan: string }[] = [];
  for (const a of (m.attachments ?? []).slice(0, 5)) {
    const kind = sniff(a.content);
    if (!kind || !["pdf", "jpeg", "png", "webp"].includes(kind) || a.content.length > 10 * 1024 * 1024) continue;
    let scan = "skipped";
    if (config.CLAMAV) scan = await clamScan(config.CLAMAV, a.content).catch(() => "error");
    if (scan.startsWith("infected") || scan === "error") continue;
    files.push({ name: (a.filename ?? "attachment").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120), mime: MIME[kind], buf: a.content, scan });
  }
  const at = m.date && !Number.isNaN(m.date.getTime()) && m.date.getTime() < Date.now() + 60_000 ? m.date : undefined;

  return db.tx(async (q) => {
    let ticketId: string;
    let number: number;
    let eventId: string;
    let created = false;
    if (t) {
      ticketId = t.id;
      number = t.number;
      eventId = await addEvent(q, keys, tenant, { ticketId, kind: "reply_in", actor: { kind: "customer", id: null, display: nameOf(m) || from }, body, messageId, at });
      // A customer answer reopens a waiting or solved ticket.
      const reopen = t.status === "pending" || t.status === "resolved" || t.status === "closed";
      await q(`UPDATE tickets SET last_customer_at = clock_timestamp() ${reopen ? ", status = 'open', resolved_at = NULL" : ""} WHERE id = $1`, [ticketId]);
      if (reopen) await addEvent(q, keys, tenant, { ticketId, kind: "status", actor: { kind: "system", id: null, display: "OPEX" }, meta: { from: t.status, to: "open", auto: true, reason: "customer_reply" } });
      const who = t.assignee_id ? [t.assignee_id] : await teamMembers(q, t.team_id);
      await notify(q, keys, config, who, { kind: "ticket.reply", ticketId, number, text: `The customer replied on ticket #${number}` });
    } else {
      const r = await createTicket(q, keys, config, {
        channel: "email",
        data: { subject: cleanText(m.subject ?? "").slice(0, 300) || "(no subject)", requester: { name: nameOf(m) || undefined, email: from }, values: {} },
        team: (await q<{ key: string }>(`SELECT key FROM teams WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, [tenant]))[0]?.key ?? null,
        first: { kind: "reply_in", body, messageId, at },
      });
      ticketId = r.id;
      number = r.number;
      eventId = r.eventId;
      created = true;
    }
    for (const x of files) {
      const id = ulid("att_");
      const enc = keys.encrypt(id, x.buf.toString("base64"));
      await q(`INSERT INTO ticket_attachments (id, tenant_id, ticket_id, event_id, name, mime, bytes, data_enc, key_id, scan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, tenant, ticketId, eventId, x.name, x.mime, x.buf.length, enc.payload, enc.keyId, x.scan]);
    }
    await audit(q, tenant, { action: created ? "ticket.created" : "ticket.customer_reply", actor: { kind: "anonymous", id: null, display: "Email" }, request: SYSTEM_REQUEST, resource: { type: "ticket", id: ticketId, number, channel: "email", files: files.length } });
    log?.info({ number, created }, "inbound email");
    return { ticket: number, created };
  });
}

/** Reads new messages from the helpdesk mailbox (IMAP_URL), oldest first, remembering the last UID. */
export async function pollMailbox(deps: Deps, log: FastifyBaseLogger) {
  const { db, config } = deps;
  if (!config.IMAP_URL) return;
  const { ImapFlow } = await import("imapflow");
  const u = new URL(config.IMAP_URL);
  const client = new ImapFlow({ host: u.hostname, port: Number(u.port || (u.protocol === "imaps:" ? 993 : 143)), secure: u.protocol === "imaps:", auth: { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }, logger: false });
  const tenant = config.TENANT;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(decodeURIComponent(u.pathname.replace(/^\//, "")) || "INBOX");
    try {
      const box = client.mailbox && typeof client.mailbox === "object" ? client.mailbox : null;
      const validity = String(box?.uidValidity ?? "");
      await db.q(`INSERT INTO mailbox_state (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [tenant]);
      const [st] = await db.q<{ uid_validity: string | null; last_uid: string }>(`SELECT uid_validity, last_uid FROM mailbox_state WHERE tenant_id = $1`, [tenant]);
      // A new UIDVALIDITY means the mailbox was rebuilt: start after the current newest message.
      let last = st!.uid_validity === validity ? Number(st!.last_uid) : Math.max(0, Number(box?.uidNext ?? 1) - 1);
      if (st!.uid_validity !== validity) await db.q(`UPDATE mailbox_state SET uid_validity = $2, last_uid = $3 WHERE tenant_id = $1`, [tenant, validity, last]);
      for await (const msg of client.fetch({ uid: `${last + 1}:*` }, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= last || !msg.source) continue;
        try {
          await handleInbound(deps, msg.source, log);
        } catch (e) {
          log.error({ err: e, uid: msg.uid }, "inbound email failed");
        }
        last = msg.uid;
        await db.q(`UPDATE mailbox_state SET last_uid = $2 WHERE tenant_id = $1`, [tenant, last]);
      }
    } finally {
      lock.release();
    }
    await db.q(`UPDATE mailbox_state SET last_poll_at = clock_timestamp(), last_error = NULL WHERE tenant_id = $1`, [tenant]);
  } catch (e) {
    await db.q(`INSERT INTO mailbox_state (tenant_id, last_poll_at, last_error) VALUES ($1, clock_timestamp(), $2) ON CONFLICT (tenant_id) DO UPDATE SET last_poll_at = EXCLUDED.last_poll_at, last_error = EXCLUDED.last_error`, [tenant, (e as Error).message.slice(0, 300)]);
    log.warn({ err: e }, "mailbox poll failed");
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** SLA: flags newly breached tickets once and tells the assignee and the team leads. */
export async function checkSla(deps: Deps) {
  const { db, config } = deps;
  const keys = pii(config);
  await db.tx(async (q) => {
    const late = await q<{ id: string; number: number; assignee_id: string | null; team_id: string | null; first_response_at: Date | null }>(
      `UPDATE tickets SET sla_breached = true WHERE tenant_id = $1 AND NOT sla_breached AND status IN ('new','open','pending','on_hold') AND ((first_response_at IS NULL AND first_response_due < clock_timestamp()) OR resolve_due < clock_timestamp()) RETURNING id, number, assignee_id, team_id, first_response_at`,
      [config.TENANT],
    );
    for (const t of late) {
      await addEvent(q, keys, config.TENANT, { ticketId: t.id, kind: "sla_breached", actor: { kind: "system", id: null, display: "OPEX" }, meta: { target: t.first_response_at ? "resolve" : "first" } });
      await notify(q, keys, config, [t.assignee_id, ...(await teamLeads(q, t.team_id))], { kind: "ticket.sla", ticketId: t.id, number: t.number, text: `Ticket #${t.number} is past its SLA target` });
    }
  });
}

/** Closed tickets past their retention are deleted (default two years); the purge is audited. */
export async function purgeTickets(deps: Deps) {
  const { db, config } = deps;
  await db.tx(async (q) => {
    const rows = await q<{ id: string }>(`DELETE FROM tickets WHERE tenant_id = $1 AND status IN ('resolved','closed','spam') AND last_activity_at < clock_timestamp() - make_interval(days => retention_days) RETURNING id`, [config.TENANT]);
    await q(`DELETE FROM notifications WHERE tenant_id = $1 AND read_at < clock_timestamp() - interval '90 days'`, [config.TENANT]);
    await q(`DELETE FROM email_outbox WHERE tenant_id = $1 AND status IN ('sent','dead') AND created_at < clock_timestamp() - interval '30 days'`, [config.TENANT]);
    if (rows.length) await audit(q, config.TENANT, { action: "ticket.purged", actor: { kind: "system", id: "retention", display: "Retention" }, request: SYSTEM_REQUEST, resource: { type: "ticket", count: rows.length } });
  });
}

/** P8 inquiries become tickets once (re-encrypted under the ticket id), then the old rows go. */
export async function importInquiries(deps: Deps) {
  const { db, config } = deps;
  const keys = pii(config);
  const tenant = config.TENANT;
  const rows = await db.q<{ id: string; form: string; payload_enc: string; key_id: string; ip: string | null; created_at: Date; handled_at: Date | null }>(`SELECT id, form, payload_enc, key_id, ip, created_at, handled_at FROM inquiries WHERE tenant_id = $1 ORDER BY created_at`, [tenant]);
  for (const r of rows) {
    await db.tx(async (q) => {
      const d = keys.decrypt<{ locale: string; page: string; subject: string; spec: string[]; fields: Record<string, string | undefined> }>(r.id, r.key_id, r.payload_enc);
      const [form] = await q<{ id: string; version: number }>(`SELECT id, version FROM forms WHERE tenant_id = $1 AND slug = $2`, [tenant, r.form]);
      const f = d.fields;
      const values = Object.fromEntries(Object.entries({ name: f.name, company: f.company, email: f.email, phone: f.phone ?? f.mobile, quantity: f.quantity, message: f.message }).filter(([, v]) => v)) as Record<string, string>;
      const t = await createTicket(q, keys, { ...config }, {
        channel: "form",
        formId: form?.id ?? null,
        formVersion: form?.version ?? null,
        data: { subject: d.subject, requester: { name: f.name, email: f.email, phone: f.phone ?? f.mobile, company: f.company }, values, context: d.spec.length ? { spec: d.spec } : undefined },
        team: "sales",
        tags: [r.form, "imported"],
        locale: d.locale,
        page: d.page,
        ip: r.ip,
        silent: true,
        first: { kind: "submitted", body: { text: [...d.spec, "", ...Object.entries(values).map(([k, v]) => `${k}: ${v}`)].join("\n").trim() }, at: r.created_at },
      });
      await q(`UPDATE tickets SET created_at = $2, last_customer_at = $2 ${r.handled_at ? ", status = 'resolved', resolved_at = $3" : ""} WHERE id = $1`, r.handled_at ? [t.id, r.created_at, r.handled_at] : [t.id, r.created_at]);
      await q(`DELETE FROM inquiries WHERE id = $1`, [r.id]);
      await audit(q, tenant, { action: "ticket.imported", actor: { kind: "system", id: "migration", display: "P11 import" }, request: SYSTEM_REQUEST, resource: { type: "ticket", id: t.id, number: t.number, inquiry: r.id } });
    });
  }
  return rows.length;
}

export { OPEN_STATUSES, openTicket };
