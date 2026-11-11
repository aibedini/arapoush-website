import { createHmac } from "node:crypto";
import type { Config } from "../config.ts";
import type { Q } from "../db/index.ts";
import { ulid } from "../ids.ts";
import { inquiryKeys } from "../inquiries/crypto.ts";
import type { FormValue, Priority } from "@arapoush/schema";

/**
 * Helpdesk core (P11): tickets, their timeline, routing, SLA, notifications and the email outbox.
 * Personal data (subject, requester, answers, message bodies) is always encrypted at rest; the row
 * or event id is bound as associated data.
 */
export type Pii = ReturnType<typeof pii>;
export function pii(config: Config) {
  const keys = inquiryKeys(config);
  const hashKey = createHmac("sha256", keys.current.key).update("requester-email").digest();
  return {
    ...keys,
    /** Stable lookup key for an email address (threading, blocking) without storing it in clear. */
    hashEmail: (email: string) => createHmac("sha256", hashKey).update(email.trim().toLowerCase()).digest("hex").slice(0, 40),
  };
}

export type Requester = { name?: string; email?: string; phone?: string; company?: string };
export type TicketData = {
  subject: string;
  requester: Requester;
  /** Form answers (field id → value), labels come from the form version. */
  values: Record<string, FormValue>;
  /** Extra context sent by built-in site components (e.g. the configurator's spec lines). */
  context?: { spec?: string[]; note?: string };
};
export type EventActor = { kind: "operator" | "customer" | "system"; id: string | null; display: string };
export const SYSTEM: EventActor = { kind: "system", id: null, display: "OPEX" };

export { STATUSES } from "./contract.ts";
import { STATUSES } from "./contract.ts";
export type Status = (typeof STATUSES)[number];
export const OPEN_STATUSES: Status[] = ["new", "open", "pending", "on_hold"];

/** Default SLA targets, minutes (first response, resolution). Teams override per priority. */
export const DEFAULT_SLA: Record<Priority, { first: number; resolve: number }> = {
  urgent: { first: 60, resolve: 8 * 60 },
  high: { first: 4 * 60, resolve: 24 * 60 },
  normal: { first: 8 * 60, resolve: 3 * 24 * 60 },
  low: { first: 24 * 60, resolve: 7 * 24 * 60 },
};
export function slaFor(teamSla: unknown, priority: Priority) {
  const t = (teamSla && typeof teamSla === "object" ? (teamSla as Record<string, { first?: number; resolve?: number }>)[priority] : undefined) ?? {};
  return { first: t.first ?? DEFAULT_SLA[priority].first, resolve: t.resolve ?? DEFAULT_SLA[priority].resolve };
}
const plus = (from: Date, minutes: number) => new Date(from.getTime() + minutes * 60_000);

export async function nextNumber(q: Q, tenant: string): Promise<number> {
  await q(`INSERT INTO ticket_counters (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [tenant]);
  const [r] = await q<{ n: number }>(`UPDATE ticket_counters SET next = next + 1 WHERE tenant_id = $1 RETURNING next - 1 AS n`, [tenant]);
  return r!.n;
}

export async function addEvent(q: Q, keys: Pii, tenant: string, e: { ticketId: string; kind: string; actor: EventActor; body?: unknown; meta?: Record<string, unknown>; messageId?: string | null; at?: Date }): Promise<string> {
  const id = ulid("tev_");
  const enc = e.body === undefined ? null : keys.encrypt(id, e.body);
  await q(
    `INSERT INTO ticket_events (id, tenant_id, ticket_id, kind, actor_kind, actor_id, actor_display, body_enc, key_id, meta, message_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, clock_timestamp()))`,
    [id, tenant, e.ticketId, e.kind, e.actor.kind, e.actor.id, e.actor.display, enc?.payload ?? null, enc?.keyId ?? null, JSON.stringify(e.meta ?? {}), e.messageId ?? null, e.at ?? null],
  );
  await q(`UPDATE tickets SET last_activity_at = clock_timestamp() WHERE id = $1`, [e.ticketId]);
  return id;
}

/** In-console notifications (and an email when the operator wants one). The text holds no PII. */
export async function notify(q: Q, keys: Pii, config: Config, who: (string | null | undefined)[], o: { kind: string; ticketId: string; number: number; text: string; except?: string | null }) {
  const ids = [...new Set(who.filter((x): x is string => !!x && x !== o.except))];
  for (const pid of ids) {
    await q(`INSERT INTO notifications (id, tenant_id, principal_id, kind, ticket_id, text) VALUES ($1,$2,$3,$4,$5,$6)`, [ulid("ntf_"), config.TENANT, pid, o.kind, o.ticketId, o.text]);
    const [p] = await q<{ email: string | null; prefs: { emailNotifications?: boolean }; status: string }>(`SELECT email, prefs, status FROM principals WHERE id = $1`, [pid]);
    if (p?.email && p.status === "active" && p.prefs?.emailNotifications !== false)
      await enqueueEmail(q, keys, config.TENANT, { kind: "notification", ticketId: o.ticketId, to: p.email, subject: `[OPEX #${o.number}] ${o.text}`.slice(0, 200), text: `${o.text}\n\n${config.CONSOLE_URL}/tickets/${o.number}\n` });
  }
}

export type OutMail = { kind: string; ticketId?: string | null; to: string; subject: string; text: string; html?: string; from?: string; replyTo?: string; messageId?: string; inReplyTo?: string; references?: string[] };
export async function enqueueEmail(q: Q, keys: Pii, tenant: string, m: OutMail) {
  const id = ulid("eml_");
  const enc = keys.encrypt(id, m);
  await q(`INSERT INTO email_outbox (id, tenant_id, kind, ticket_id, message_enc, key_id) VALUES ($1,$2,$3,$4,$5,$6)`, [id, tenant, m.kind, m.ticketId ?? null, enc.payload, enc.keyId]);
  return id;
}

/** Members of the team who are available, least open tickets first (round robin on ties). */
export async function pickAssignee(q: Q, teamId: string): Promise<string | null> {
  const [r] = await q<{ id: string }>(
    `SELECT m.principal_id AS id FROM team_members m JOIN principals p ON p.id = m.principal_id
      LEFT JOIN tickets t ON t.assignee_id = m.principal_id AND t.status IN ('new','open','pending','on_hold')
      WHERE m.team_id = $1 AND m.available AND p.status = 'active' AND p.role IN ('operator','super_admin')
      GROUP BY m.principal_id ORDER BY count(t.id), max(t.created_at) NULLS FIRST, m.principal_id LIMIT 1`,
    [teamId],
  );
  return r?.id ?? null;
}

export async function teamLeads(q: Q, teamId: string | null): Promise<string[]> {
  if (!teamId) return [];
  return (await q<{ id: string }>(`SELECT principal_id AS id FROM team_members WHERE team_id = $1 AND role = 'lead'`, [teamId])).map((r) => r.id);
}
export async function teamMembers(q: Q, teamId: string | null): Promise<string[]> {
  if (!teamId) return [];
  return (await q<{ id: string }>(`SELECT principal_id AS id FROM team_members WHERE team_id = $1`, [teamId])).map((r) => r.id);
}

export type NewTicket = {
  channel: "form" | "email";
  formId?: string | null;
  formVersion?: number | null;
  data: TicketData;
  team?: string | null; // team key
  priority?: Priority;
  assignee?: string | null;
  tags?: string[];
  locale?: string | null;
  page?: string | null;
  ip?: string | null;
  retentionDays?: number;
  /** No notifications (imports). */
  silent?: boolean;
  /** The first message on the timeline (form submission or email body). */
  first: { kind: "submitted" | "reply_in"; body: unknown; messageId?: string | null; at?: Date };
};

/** Creates a ticket, routes it, starts its SLA clocks and tells the right people. */
export async function createTicket(q: Q, keys: Pii, config: Config, t: NewTicket): Promise<{ id: string; number: number; eventId: string }> {
  const tenant = config.TENANT;
  const id = ulid("tkt_");
  const number = await nextNumber(q, tenant);
  const priority = t.priority ?? "normal";
  const [team] = t.team ? await q<{ id: string; sla: unknown; auto_assign: boolean }>(`SELECT id, sla, auto_assign FROM teams WHERE tenant_id = $1 AND key = $2`, [tenant, t.team]) : [];
  let assignee = t.assignee ? ((await q<{ id: string }>(`SELECT id FROM principals WHERE id = $1 AND kind = 'operator' AND status = 'active'`, [t.assignee]))[0]?.id ?? null) : null;
  if (!assignee && team?.auto_assign) assignee = await pickAssignee(q, team.id);
  const now = new Date();
  const sla = slaFor(team?.sla, priority);
  const enc = keys.encrypt(id, t.data);
  const email = t.data.requester.email;
  await q(
    `INSERT INTO tickets (id, tenant_id, number, channel, form_id, form_version, status, priority, team_id, assignee_id, tags, data_enc, key_id, requester_hash, locale, page, ip, first_response_due, resolve_due, retention_days, last_customer_at)
     VALUES ($1,$2,$3,$4,$5,$6,'new',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,clock_timestamp())`,
    [id, tenant, number, t.channel, t.formId ?? null, t.formVersion ?? null, priority, team?.id ?? null, assignee, t.tags ?? [], enc.payload, enc.keyId, email ? keys.hashEmail(email) : null, t.locale ?? null, t.page ?? null, t.ip ?? null, plus(now, sla.first), plus(now, sla.resolve), t.retentionDays ?? 730],
  );
  const customer: EventActor = { kind: "customer", id: null, display: t.data.requester.name || t.data.requester.email || "Customer" };
  const eventId = await addEvent(q, keys, tenant, { ticketId: id, kind: t.first.kind, actor: customer, body: t.first.body, messageId: t.first.messageId, at: t.first.at });
  if (team || assignee) await addEvent(q, keys, tenant, { ticketId: id, kind: "routed", actor: SYSTEM, meta: { team: team?.id ?? null, assignee, priority, auto: !t.assignee && !!assignee } });
  // The assignee hears about it; with nobody assigned, the whole team does.
  const who = t.silent ? [] : assignee ? [assignee] : await teamMembers(q, team?.id ?? null);
  await notify(q, keys, config, who, { kind: "ticket.new", ticketId: id, number, text: `New ticket #${number}${assignee ? " assigned to you" : ""}` });
  return { id, number, eventId };
}

export function openTicket(keys: Pii, r: { id: string; key_id: string; data_enc: string }): TicketData {
  return keys.decrypt<TicketData>(r.id, r.key_id, r.data_enc);
}
export function openEvent<T = unknown>(keys: Pii, r: { id: string; key_id: string | null; body_enc: string | null }): T | null {
  return r.body_enc && r.key_id ? keys.decrypt<T>(r.id, r.key_id, r.body_enc) : null;
}

/** The domain used in our Message-IDs (from the support address). */
export const mailDomain = (config: Config) => config.SUPPORT_ADDRESS.split("@")[1] ?? "opex.local";
export const replyMessageId = (config: Config, eventId: string) => `<tkt.${eventId}@${mailDomain(config)}>`;
