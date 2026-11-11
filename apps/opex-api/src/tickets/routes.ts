import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { PRIORITIES, type FormDefinition, type Priority } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { badRequest, forbidden, notFound } from "../http/problem.ts";
import { ulid } from "../ids.ts";
import { importInquiries } from "./mail.ts";
import { addEvent, enqueueEmail, notify, OPEN_STATUSES, openEvent, openTicket, pickAssignee, pii, replyMessageId, slaFor, STATUSES, teamMembers, type EventActor, type Status } from "./service.ts";

type TicketRow = {
  id: string;
  number: number;
  channel: string;
  form_id: string | null;
  form_version: number | null;
  status: Status;
  priority: Priority;
  team_id: string | null;
  assignee_id: string | null;
  tags: string[];
  data_enc: string;
  key_id: string;
  requester_hash: string | null;
  locale: string | null;
  page: string | null;
  ip: string | null;
  first_response_due: Date | null;
  resolve_due: Date | null;
  first_response_at: Date | null;
  resolved_at: Date | null;
  sla_breached: boolean;
  merged_into: string | null;
  last_activity_at: Date;
  last_customer_at: Date | null;
  created_at: Date;
};
type EventRow = { id: string; kind: string; actor_kind: string; actor_id: string | null; actor_display: string | null; body_enc: string | null; key_id: string | null; meta: Record<string, unknown>; message_id: string | null; created_at: Date };

const VIEWS = ["mine", "unassigned", "teams", "all", "overdue", "waiting", "closed", "spam"] as const;
const OPEN_SQL = `('new','open','pending','on_hold')`;
const OVERDUE_SQL = `((t.first_response_at IS NULL AND t.first_response_due < clock_timestamp()) OR t.resolve_due < clock_timestamp())`;
const viewSql = (v: (typeof VIEWS)[number]) =>
  ({
    mine: `t.assignee_id = $2 AND t.status IN ${OPEN_SQL}`,
    unassigned: `t.assignee_id IS NULL AND t.status IN ${OPEN_SQL}`,
    teams: `t.team_id = ANY($3) AND t.status IN ${OPEN_SQL}`,
    all: `t.status IN ${OPEN_SQL}`,
    overdue: `t.status IN ${OPEN_SQL} AND ${OVERDUE_SQL}`,
    waiting: `t.status = 'pending'`,
    closed: `t.status IN ('resolved','closed')`,
    spam: `t.status = 'spam'`,
  })[v];

/**
 * Helpdesk (P11): the ticket inbox for form submissions and customer email. Operators see tickets of
 * their teams, tickets assigned to them and unrouted ones; super admins see all. Every opening is
 * recorded (timeline + audit), so "who opened it and who read it" is always answerable.
 */
export async function ticketsModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const keys = pii(config);
  await importInquiries(deps);
  const agent = requireOperator(deps, "operator");
  const me = (req: FastifyRequest): EventActor => ({ kind: "operator", id: req.principal!.id, display: req.principal!.display });

  // Inside a transaction every query must use its `q` (PGlite has one connection).
  const scopeOf = async (req: FastifyRequest, q: Q = db.q.bind(db) as Q) => {
    const teams = (await q<{ team_id: string }>(`SELECT team_id FROM team_members WHERE principal_id = $1`, [req.principal!.id])).map((r) => r.team_id);
    return { all: req.principal!.role === "super_admin", teams, me: req.principal!.id };
  };
  const scopeSql = `($4::boolean OR t.assignee_id = $2 OR t.team_id = ANY($3) OR t.team_id IS NULL)`;

  /** Loads a ticket the caller may see (by id or number). */
  const load = async (req: FastifyRequest, ref: string, q: Q = db.q.bind(db) as Q) => {
    const s = await scopeOf(req, q);
    const byNumber = /^\d+$/.test(ref);
    const [t] = await q<TicketRow>(`SELECT t.* FROM tickets t WHERE t.tenant_id = $1 AND ${byNumber ? "t.number = $5::int" : "t.id = $5"} AND ${scopeSql}`, [tenant, s.me, s.teams, s.all, ref]);
    if (!t) throw notFound("Ticket");
    return t;
  };
  const people = async (ids: (string | null)[], q: Q = db.q.bind(db) as Q) => {
    const list = [...new Set(ids.filter(Boolean))] as string[];
    if (!list.length) return new Map<string, string>();
    return new Map((await q<{ id: string; display_name: string }>(`SELECT id, display_name FROM principals WHERE id = ANY($1)`, [list])).map((p) => [p.id, p.display_name]));
  };
  const sla = (t: TicketRow) => {
    const now = Date.now();
    const open = OPEN_STATUSES.includes(t.status);
    const firstDue = !t.first_response_at && t.first_response_due ? new Date(t.first_response_due) : null;
    const resolveDue = open && t.resolve_due ? new Date(t.resolve_due) : null;
    const next = [firstDue, resolveDue].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    return { next: next?.toISOString() ?? null, kind: next === firstDue && firstDue ? "first" : "resolve", breached: open && !!next && next.getTime() < now, firstResponseAt: t.first_response_at };
  };

  // ── Lists ──
  app.get("/v1/manage/tickets", { preHandler: agent }, async (req) => {
    const f = z
      .object({
        view: z.enum(VIEWS).default("all"),
        q: z.string().max(200).optional(),
        status: z.enum(STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        team: z.string().max(40).optional(),
        assignee: z.string().max(40).optional(),
        form: z.string().max(40).optional(),
        tag: z.string().max(40).optional(),
        before: z.string().optional(),
      })
      .parse(req.query);
    const s = await scopeOf(req);
    const params: unknown[] = [tenant, s.me, s.teams, s.all];
    const where = [`t.tenant_id = $1`, scopeSql, `t.merged_into IS NULL`, f.status ? `t.status = $${params.push(f.status)}` : viewSql(f.view)];
    if (f.priority) where.push(`t.priority = $${params.push(f.priority)}`);
    if (f.team) where.push(f.team === "none" ? `t.team_id IS NULL` : `t.team_id = $${params.push(f.team)}`);
    if (f.assignee) where.push(f.assignee === "none" ? `t.assignee_id IS NULL` : `t.assignee_id = $${params.push(f.assignee)}`);
    if (f.form) where.push(`t.form_id = $${params.push(f.form)}`);
    if (f.tag) where.push(`$${params.push(f.tag)} = ANY(t.tags)`);
    if (f.before) where.push(`t.last_activity_at < $${params.push(new Date(f.before))}`);
    const term = f.q?.trim().replace(/^#/, "");
    const numeric = term && /^\d+$/.test(term);
    if (numeric) where.push(`t.number = $${params.push(Number(term))}`);
    // Text search runs over decrypted subjects and requesters, so it scans a bounded window.
    const limit = term && !numeric ? 1000 : 60;
    const rows = await db.q<TicketRow & { read_at: Date | null; team_name: string | null; form_slug: string | null }>(
      `SELECT t.*, r.last_read_at AS read_at, tm.name AS team_name, fm.slug AS form_slug FROM tickets t
         LEFT JOIN ticket_reads r ON r.ticket_id = t.id AND r.principal_id = $2
         LEFT JOIN teams tm ON tm.id = t.team_id LEFT JOIN forms fm ON fm.id = t.form_id
        WHERE ${where.join(" AND ")} ORDER BY t.last_activity_at DESC LIMIT ${limit}`,
      params,
    );
    const names = await people(rows.map((r) => r.assignee_id));
    let items = rows.map((t) => {
      const d = openTicket(keys, t);
      return {
        id: t.id,
        number: t.number,
        subject: d.subject,
        requester: { name: d.requester.name ?? null, email: d.requester.email ?? null, company: d.requester.company ?? null },
        status: t.status,
        priority: t.priority,
        channel: t.channel,
        form: t.form_slug,
        team: t.team_id ? { id: t.team_id, name: t.team_name } : null,
        assignee: t.assignee_id ? { id: t.assignee_id, name: names.get(t.assignee_id) ?? "?" } : null,
        tags: t.tags,
        unread: !t.read_at || new Date(t.read_at) < new Date(t.last_activity_at),
        sla: sla(t),
        last_activity_at: t.last_activity_at,
        created_at: t.created_at,
      };
    });
    if (term && !numeric) {
      const needle = term.toLowerCase();
      items = items.filter((i) => [i.subject, i.requester.name, i.requester.email, i.requester.company].some((x) => x?.toLowerCase().includes(needle))).slice(0, 60);
    }
    await auditNow(db, tenant, { action: "ticket.list", actor: actorOf(req), request: req.info, resource: { type: "ticket", view: f.view, count: items.length, ids: items.map((i) => i.id).slice(0, 60) } });
    return items;
  });

  app.get("/v1/manage/tickets/counts", { preHandler: agent }, async (req) => {
    const s = await scopeOf(req);
    const sel = VIEWS.map((v) => `count(*) FILTER (WHERE ${viewSql(v)})::int AS "${v}"`).join(", ");
    const [c] = await db.q(`SELECT ${sel}, count(*) FILTER (WHERE t.status IN ${OPEN_SQL} AND (r.last_read_at IS NULL OR r.last_read_at < t.last_activity_at) AND (t.assignee_id = $2 OR t.assignee_id IS NULL))::int AS unread FROM tickets t LEFT JOIN ticket_reads r ON r.ticket_id = t.id AND r.principal_id = $2 WHERE t.tenant_id = $1 AND t.merged_into IS NULL AND ${scopeSql}`, [tenant, s.me, s.teams, s.all]);
    return c;
  });

  // ── One ticket ──
  app.get("/v1/manage/tickets/:ref", { preHandler: agent }, async (req) => {
    const t = await load(req, (req.params as { ref: string }).ref);
    const data = openTicket(keys, t);
    const actor = me(req);
    await db.tx(async (q) => {
      // "Opened by": one viewed event per operator per 10 minutes, and the read marker.
      const [recent] = await q(`SELECT 1 FROM ticket_events WHERE ticket_id = $1 AND kind = 'viewed' AND actor_id = $2 AND created_at > clock_timestamp() - interval '10 minutes'`, [t.id, actor.id]);
      if (!recent) {
        await q(`INSERT INTO ticket_events (id, tenant_id, ticket_id, kind, actor_kind, actor_id, actor_display) VALUES ($1,$2,$3,'viewed','operator',$4,$5)`, [ulid("tev_"), tenant, t.id, actor.id, actor.display]);
      }
      await q(`INSERT INTO ticket_reads (ticket_id, principal_id) VALUES ($1,$2) ON CONFLICT (ticket_id, principal_id) DO UPDATE SET last_read_at = clock_timestamp()`, [t.id, actor.id]);
      if (t.status === "new" && (t.assignee_id === actor.id || !t.assignee_id)) {
        await q(`UPDATE tickets SET status = 'open' WHERE id = $1`, [t.id]);
        await addEvent(q, keys, tenant, { ticketId: t.id, kind: "status", actor, meta: { from: "new", to: "open", auto: true } });
        t.status = "open";
      }
      await audit(q, tenant, { action: "ticket.read", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number } });
    });
    const events = await db.q<EventRow>(`SELECT * FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at, id`, [t.id]);
    const reads = await db.q<{ principal_id: string; display_name: string; first_opened_at: Date; last_read_at: Date }>(`SELECT r.principal_id, p.display_name, r.first_opened_at, r.last_read_at FROM ticket_reads r JOIN principals p ON p.id = r.principal_id WHERE r.ticket_id = $1 ORDER BY r.first_opened_at`, [t.id]);
    const atts = await db.q(`SELECT id, event_id, field, name, mime, bytes, scan, created_at FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at`, [t.id]);
    const [def] = t.form_id && t.form_version ? await db.q<{ definition: FormDefinition; slug: string }>(`SELECT v.definition, f.slug FROM form_versions v JOIN forms f ON f.id = v.form_id WHERE v.form_id = $1 AND v.version = $2`, [t.form_id, t.form_version]) : [];
    const names = await people([t.assignee_id]);
    const [team] = t.team_id ? await db.q<{ id: string; name: string }>(`SELECT id, name FROM teams WHERE id = $1`, [t.team_id]) : [];
    const [merged] = t.merged_into ? await db.q<{ number: number }>(`SELECT number FROM tickets WHERE id = $1`, [t.merged_into]) : [];
    const history = data.requester.email && t.requester_hash ? await db.q<{ number: number; status: string; created_at: Date }>(`SELECT number, status, created_at FROM tickets WHERE tenant_id = $1 AND requester_hash = $2 AND id <> $3 ORDER BY created_at DESC LIMIT 10`, [tenant, t.requester_hash, t.id]) : [];
    return {
      ticket: {
        id: t.id,
        number: t.number,
        status: t.status,
        priority: t.priority,
        channel: t.channel,
        tags: t.tags,
        locale: t.locale,
        page: t.page,
        ip: t.ip,
        team: team ?? null,
        assignee: t.assignee_id ? { id: t.assignee_id, name: names.get(t.assignee_id) ?? "?" } : null,
        sla: sla(t),
        created_at: t.created_at,
        resolved_at: t.resolved_at,
        merged_into: merged?.number ?? null,
      },
      data,
      form: def ? { slug: def.slug, version: t.form_version, fields: def.definition.fields.filter((f) => !["heading", "paragraph"].includes(f.type)).map((f) => ({ id: f.id, type: f.type, label: f.label, options: f.options })) } : null,
      events: events.map((e) => ({ id: e.id, kind: e.kind, actor: { kind: e.actor_kind, id: e.actor_id, name: e.actor_display }, body: openEvent(keys, e), meta: e.meta, created_at: e.created_at })),
      reads,
      attachments: atts,
      history,
    };
  });

  const Update = z.strictObject({ status: z.enum(STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), team: z.string().max(40).nullable().optional(), tags: z.array(z.string().min(1).max(40)).max(20).optional() });
  /** Status, priority, team and tags changes, each on the timeline. */
  async function update(q: Q, req: FastifyRequest, t: TicketRow, u: z.infer<typeof Update>) {
    const actor = me(req);
    if (u.status && u.status !== t.status) {
      await q(`UPDATE tickets SET status = $2, resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, clock_timestamp()) ELSE NULL END WHERE id = $1`, [t.id, u.status]);
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "status", actor, meta: { from: t.status, to: u.status } });
    }
    if (u.team !== undefined && u.team !== t.team_id) {
      const [team] = u.team ? await q<{ id: string; name: string; sla: unknown }>(`SELECT id, name, sla FROM teams WHERE id = $1 AND tenant_id = $2`, [u.team, tenant]) : [];
      if (u.team && !team) throw badRequest("UNKNOWN_TEAM", "No such team");
      await q(`UPDATE tickets SET team_id = $2 WHERE id = $1`, [t.id, u.team]);
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "team", actor, meta: { from: t.team_id, to: u.team, name: team?.name ?? null } });
      await notify(q, keys, config, await teamMembers(q, u.team), { kind: "ticket.team", ticketId: t.id, number: t.number, text: `Ticket #${t.number} was moved to your team by ${actor.display}`, except: actor.id });
    }
    if (u.priority && u.priority !== t.priority) {
      const [team] = t.team_id ? await q<{ sla: unknown }>(`SELECT sla FROM teams WHERE id = $1`, [t.team_id]) : [];
      const s = slaFor(team?.sla, u.priority);
      const from = new Date(t.created_at).getTime();
      await q(`UPDATE tickets SET priority = $2, first_response_due = $3, resolve_due = $4 WHERE id = $1`, [t.id, u.priority, new Date(from + s.first * 60_000), new Date(from + s.resolve * 60_000)]);
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "priority", actor, meta: { from: t.priority, to: u.priority } });
    }
    if (u.tags && JSON.stringify([...u.tags].sort()) !== JSON.stringify([...t.tags].sort())) {
      await q(`UPDATE tickets SET tags = $2 WHERE id = $1`, [t.id, [...new Set(u.tags)]]);
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "tags", actor, meta: { from: t.tags, to: u.tags } });
    }
    if (t.assignee_id && t.assignee_id !== actor.id && (u.status || u.priority)) await notify(q, keys, config, [t.assignee_id], { kind: "ticket.updated", ticketId: t.id, number: t.number, text: `${actor.display} updated ticket #${t.number}` });
    await audit(q, tenant, { action: "ticket.updated", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number }, changes: [u] });
  }

  app.patch("/v1/manage/tickets/:ref", { preHandler: agent }, async (req) => {
    const u = Update.parse(req.body);
    await db.tx(async (q) => update(q, req, await load(req, (req.params as { ref: string }).ref, q), u));
    return { ok: true };
  });

  const operatorExists = async (q: Q, id: string) => !!(await q(`SELECT 1 FROM principals WHERE id = $1 AND tenant_id = $2 AND kind = 'operator' AND status = 'active' AND role IN ('operator','super_admin')`, [id, tenant])).length;

  app.post("/v1/manage/tickets/:ref/assign", { preHandler: agent }, async (req) => {
    const { assignee } = z.strictObject({ assignee: z.string().max(40).nullable() }).parse(req.body);
    await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      if (assignee && !(await operatorExists(q, assignee))) throw badRequest("UNKNOWN_OPERATOR", "No such operator");
      if (assignee === t.assignee_id) return;
      const actor = me(req);
      await q(`UPDATE tickets SET assignee_id = $2 WHERE id = $1`, [t.id, assignee]);
      const n = await people([assignee, t.assignee_id], q);
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "assigned", actor, meta: { from: t.assignee_id, fromName: t.assignee_id ? n.get(t.assignee_id) : null, to: assignee, toName: assignee ? n.get(assignee) : null } });
      await notify(q, keys, config, [assignee], { kind: "ticket.assigned", ticketId: t.id, number: t.number, text: `${actor.display} assigned ticket #${t.number} to you`, except: actor.id });
      await audit(q, tenant, { action: "ticket.assigned", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number, from: t.assignee_id, to: assignee } });
    });
    return { ok: true };
  });

  // Referral ("ارجاع"): to a colleague or a team, with a message. With transfer, ownership moves too.
  app.post("/v1/manage/tickets/:ref/refer", { preHandler: agent }, async (req) => {
    const b = z.strictObject({ to: z.string().max(40).optional(), team: z.string().max(40).optional(), message: z.string().trim().min(2).max(5000), transfer: z.boolean().default(false) }).refine((x) => !!x.to !== !!x.team, "Refer to one person or one team").parse(req.body);
    await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      const actor = me(req);
      let toName = "";
      let who: string[] = [];
      if (b.to) {
        if (!(await operatorExists(q, b.to))) throw badRequest("UNKNOWN_OPERATOR", "No such operator");
        toName = (await people([b.to], q)).get(b.to) ?? "";
        who = [b.to];
        if (b.transfer) await q(`UPDATE tickets SET assignee_id = $2 WHERE id = $1`, [t.id, b.to]);
      } else {
        const [team] = await q<{ id: string; name: string; auto_assign: boolean }>(`SELECT id, name, auto_assign FROM teams WHERE id = $1 AND tenant_id = $2`, [b.team, tenant]);
        if (!team) throw badRequest("UNKNOWN_TEAM", "No such team");
        toName = team.name;
        who = await teamMembers(q, team.id);
        if (b.transfer) {
          const next = team.auto_assign ? await pickAssignee(q, team.id) : null;
          await q(`UPDATE tickets SET team_id = $2, assignee_id = $3 WHERE id = $1`, [t.id, team.id, next]);
          if (next) who = [next];
        }
      }
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: b.transfer ? "transferred" : "referred", actor, body: { text: b.message }, meta: { to: b.to ?? null, team: b.team ?? null, toName } });
      await notify(q, keys, config, who, { kind: "ticket.referred", ticketId: t.id, number: t.number, text: `${actor.display} referred ticket #${t.number} to ${b.to ? "you" : toName}`, except: actor.id });
      await audit(q, tenant, { action: b.transfer ? "ticket.transferred" : "ticket.referred", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number, to: b.to ?? null, team: b.team ?? null } });
    });
    return { ok: true };
  });

  app.post("/v1/manage/tickets/:ref/notes", { preHandler: agent }, async (req) => {
    const b = z.strictObject({ body: z.string().trim().min(1).max(10_000), mentions: z.array(z.string().max(40)).max(20).default([]) }).parse(req.body);
    const id = await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      const actor = me(req);
      const mentions: string[] = [];
      for (const m of b.mentions) if (await operatorExists(q, m)) mentions.push(m);
      const id = await addEvent(q, keys, tenant, { ticketId: t.id, kind: "note", actor, body: { text: b.body }, meta: { mentions } });
      await notify(q, keys, config, mentions, { kind: "ticket.mention", ticketId: t.id, number: t.number, text: `${actor.display} mentioned you on ticket #${t.number}`, except: actor.id });
      await notify(q, keys, config, [t.assignee_id].filter((x) => x && !mentions.includes(x)), { kind: "ticket.note", ticketId: t.id, number: t.number, text: `${actor.display} added a note to ticket #${t.number}`, except: actor.id });
      await q(`INSERT INTO ticket_reads (ticket_id, principal_id) VALUES ($1,$2) ON CONFLICT (ticket_id, principal_id) DO UPDATE SET last_read_at = clock_timestamp()`, [t.id, actor.id]);
      await audit(q, tenant, { action: "ticket.note", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number, mentions: mentions.length } });
      return id;
    });
    return { id };
  });

  // Reply to the customer by email; their answer threads back (Message-ID / References / [#n]).
  app.post("/v1/manage/tickets/:ref/replies", { preHandler: agent }, async (req) => {
    const b = z.strictObject({ body: z.string().trim().min(1).max(20_000), status: z.enum(["open", "pending", "on_hold", "resolved"]).default("pending") }).parse(req.body);
    const id = await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      const data = openTicket(keys, t);
      if (!data.requester.email) throw badRequest("NO_EMAIL", "This ticket has no customer email address");
      const actor = me(req);
      const thread = await q<{ message_id: string; kind: string }>(`SELECT message_id, kind FROM ticket_events WHERE ticket_id = $1 AND message_id IS NOT NULL ORDER BY created_at`, [t.id]);
      const id = await addEvent(q, keys, tenant, { ticketId: t.id, kind: "reply_out", actor, body: { text: b.body } });
      const messageId = replyMessageId(config, id);
      await q(`UPDATE ticket_events SET message_id = $2 WHERE id = $1`, [id, messageId]);
      const lastIn = [...thread].reverse().find((e) => e.kind === "reply_in") ?? thread[thread.length - 1];
      const fa = t.locale === "fa";
      await enqueueEmail(q, keys, tenant, {
        kind: "reply",
        ticketId: t.id,
        to: data.requester.email,
        from: `"${config.SUPPORT_NAME}" <${config.SUPPORT_ADDRESS}>`,
        messageId,
        inReplyTo: lastIn?.message_id,
        references: thread.map((e) => e.message_id).slice(-20),
        subject: `${/^re:/i.test(data.subject) ? "" : "Re: "}${data.subject} [#${t.number}]`.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: `${b.body}\n\n— ${actor.display}\n${config.SUPPORT_NAME}\n\n${fa ? "شمارهٔ درخواست" : "Ticket"} #${t.number}`,
      });
      await q(`UPDATE tickets SET first_response_at = COALESCE(first_response_at, clock_timestamp()), assignee_id = COALESCE(assignee_id, $2) WHERE id = $1`, [t.id, actor.id]);
      await update(q, req, { ...t, assignee_id: t.assignee_id ?? actor.id }, { status: b.status });
      await q(`INSERT INTO ticket_reads (ticket_id, principal_id) VALUES ($1,$2) ON CONFLICT (ticket_id, principal_id) DO UPDATE SET last_read_at = clock_timestamp()`, [t.id, actor.id]);
      await audit(q, tenant, { action: "ticket.replied", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number } });
      return id;
    });
    return { id };
  });

  app.post("/v1/manage/tickets/:ref/merge", { preHandler: agent }, async (req) => {
    const { into } = z.strictObject({ into: z.number().int() }).parse(req.body);
    await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      const target = await load(req, String(into), q);
      if (target.id === t.id || target.merged_into) throw badRequest("BAD_MERGE", "Choose another ticket");
      const actor = me(req);
      await q(`UPDATE ticket_events SET ticket_id = $2 WHERE ticket_id = $1 AND kind NOT IN ('viewed')`, [t.id, target.id]);
      await q(`UPDATE ticket_attachments SET ticket_id = $2 WHERE ticket_id = $1`, [t.id, target.id]);
      await q(`UPDATE tickets SET merged_into = $2, status = 'closed', resolved_at = clock_timestamp() WHERE id = $1`, [t.id, target.id]);
      await addEvent(q, keys, tenant, { ticketId: target.id, kind: "merged", actor, meta: { from: t.number } });
      await addEvent(q, keys, tenant, { ticketId: t.id, kind: "merged", actor, meta: { into: target.number } });
      await audit(q, tenant, { action: "ticket.merged", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number, into: target.number } });
    });
    return { ok: true };
  });

  app.post("/v1/manage/tickets/:ref/spam", { preHandler: agent }, async (req) => {
    const { spam, block } = z.strictObject({ spam: z.boolean(), block: z.boolean().default(false) }).parse(req.body);
    await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      await update(q, req, t, { status: spam ? "spam" : "open" });
      if (spam && block && t.requester_hash) await q(`INSERT INTO sender_blocks (tenant_id, hash, until) VALUES ($1,$2, clock_timestamp() + interval '30 days') ON CONFLICT (tenant_id, hash) DO UPDATE SET until = EXCLUDED.until`, [tenant, t.requester_hash]);
      if (!spam && t.requester_hash) await q(`DELETE FROM sender_blocks WHERE tenant_id = $1 AND hash = $2`, [tenant, t.requester_hash]);
    });
    return { ok: true };
  });

  app.post("/v1/manage/tickets/bulk", { preHandler: agent }, async (req) => {
    const b = z.strictObject({ ids: z.array(z.string().max(40)).min(1).max(100), status: z.enum(STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), team: z.string().max(40).nullable().optional(), assignee: z.string().max(40).nullable().optional() }).parse(req.body);
    let n = 0;
    await db.tx(async (q) => {
      if (b.assignee && !(await operatorExists(q, b.assignee))) throw badRequest("UNKNOWN_OPERATOR", "No such operator");
      for (const id of b.ids) {
        const t = await load(req, id, q);
        await update(q, req, t, { status: b.status, priority: b.priority, team: b.team });
        if (b.assignee !== undefined && b.assignee !== t.assignee_id) {
          await q(`UPDATE tickets SET assignee_id = $2 WHERE id = $1`, [t.id, b.assignee]);
          await addEvent(q, keys, tenant, { ticketId: t.id, kind: "assigned", actor: me(req), meta: { from: t.assignee_id, to: b.assignee, toName: b.assignee ? (await people([b.assignee], q)).get(b.assignee) : null } });
          await notify(q, keys, config, [b.assignee], { kind: "ticket.assigned", ticketId: t.id, number: t.number, text: `${me(req).display} assigned ticket #${t.number} to you`, except: req.principal!.id });
        }
        n++;
      }
    });
    return { updated: n };
  });

  app.get("/v1/manage/tickets/:ref/attachments/:att", { preHandler: agent }, async (req, reply) => {
    const { ref, att } = req.params as { ref: string; att: string };
    const t = await load(req, ref);
    const [a] = await db.q<{ id: string; name: string; mime: string; data_enc: string; key_id: string }>(`SELECT id, name, mime, data_enc, key_id FROM ticket_attachments WHERE id = $1 AND ticket_id = $2`, [att, t.id]);
    if (!a) throw notFound("Attachment");
    await auditNow(db, tenant, { action: "ticket.attachment_read", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number, attachment: a.id } });
    const buf = Buffer.from(keys.decrypt<string>(a.id, a.key_id, a.data_enc), "base64");
    reply.headers({ "content-type": a.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`, "x-content-type-options": "nosniff", "cache-control": "no-store", "content-security-policy": "sandbox" });
    return reply.send(buf);
  });

  // Erasure on request (privacy): super admin with step-up; the audit row keeps that it existed.
  app.delete("/v1/manage/tickets/:ref", { preHandler: [requireOperator(deps, "super_admin"), requireStepUp(deps)] }, async (req) => {
    const { reason } = z.strictObject({ reason: z.string().min(3).max(300) }).parse(req.body ?? {});
    await db.tx(async (q) => {
      const t = await load(req, (req.params as { ref: string }).ref, q);
      await q(`DELETE FROM tickets WHERE id = $1`, [t.id]);
      await audit(q, tenant, { action: "ticket.erased", actor: actorOf(req), request: req.info, resource: { type: "ticket", id: t.id, number: t.number }, reason });
    });
    return { ok: true };
  });

  // ── People, teams, preferences ──
  app.get("/v1/manage/helpdesk/people", { preHandler: agent }, async () =>
    db.q(
      `SELECT p.id, p.display_name AS name, p.role, COALESCE(json_agg(json_build_object('team', m.team_id, 'role', m.role, 'available', m.available)) FILTER (WHERE m.team_id IS NOT NULL), '[]') AS teams
         FROM principals p LEFT JOIN team_members m ON m.principal_id = p.id
        WHERE p.tenant_id = $1 AND p.kind = 'operator' AND p.status = 'active' AND p.role IN ('operator','super_admin') GROUP BY p.id ORDER BY p.display_name`,
      [tenant],
    ),
  );

  app.get("/v1/manage/teams", { preHandler: requireOperator(deps, "viewer") }, async () =>
    db.q(
      `SELECT t.id, t.key, t.name, t.sla, t.auto_assign,
              COALESCE(json_agg(json_build_object('id', p.id, 'name', p.display_name, 'role', m.role, 'available', m.available) ORDER BY p.display_name) FILTER (WHERE p.id IS NOT NULL), '[]') AS members,
              (SELECT count(*)::int FROM tickets x WHERE x.team_id = t.id AND x.status IN ${OPEN_SQL}) AS open
         FROM teams t LEFT JOIN team_members m ON m.team_id = t.id LEFT JOIN principals p ON p.id = m.principal_id
        WHERE t.tenant_id = $1 GROUP BY t.id ORDER BY t.name`,
      [tenant],
    ),
  );

  const admin = requireOperator(deps, "super_admin");
  const SlaBody = z.partialRecord(z.enum(PRIORITIES), z.strictObject({ first: z.number().int().min(5).max(60 * 24 * 30), resolve: z.number().int().min(5).max(60 * 24 * 90) }));
  app.post("/v1/manage/teams", { preHandler: admin }, async (req) => {
    const b = z.strictObject({ key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), name: z.string().trim().min(1).max(80) }).parse(req.body);
    const id = ulid("team_");
    await db.tx(async (q) => {
      const r = await q(`INSERT INTO teams (id, tenant_id, key, name) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [id, tenant, b.key, b.name]);
      if (!r.length) throw badRequest("KEY_TAKEN", "A team with this key exists");
      await audit(q, tenant, { action: "team.created", actor: actorOf(req), request: req.info, resource: { type: "team", id, key: b.key } });
    });
    return { id };
  });

  const isLead = async (req: FastifyRequest, teamId: string) =>
    req.principal!.role === "super_admin" || !!(await db.q(`SELECT 1 FROM team_members WHERE team_id = $1 AND principal_id = $2 AND role = 'lead'`, [teamId, req.principal!.id])).length;

  app.patch("/v1/manage/teams/:id", { preHandler: agent }, async (req) => {
    const { id } = req.params as { id: string };
    const b = z.strictObject({ name: z.string().trim().min(1).max(80).optional(), sla: SlaBody.optional(), auto_assign: z.boolean().optional() }).parse(req.body);
    if (!(await isLead(req, id))) throw forbidden("ROLE_DENIED", "Only a team lead or a super admin can change the team");
    await db.tx(async (q) => {
      const r = await q(`UPDATE teams SET name = COALESCE($3, name), sla = COALESCE($4, sla), auto_assign = COALESCE($5, auto_assign) WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenant, b.name ?? null, b.sla ? JSON.stringify(b.sla) : null, b.auto_assign ?? null]);
      if (!r.length) throw notFound("Team");
      await audit(q, tenant, { action: "team.updated", actor: actorOf(req), request: req.info, resource: { type: "team", id }, changes: [b] });
    });
    return { ok: true };
  });

  app.put("/v1/manage/teams/:id/members", { preHandler: agent }, async (req) => {
    const { id } = req.params as { id: string };
    const members = z.array(z.strictObject({ id: z.string().max(40), role: z.enum(["agent", "lead"]) })).max(100).parse(req.body);
    if (!(await isLead(req, id))) throw forbidden("ROLE_DENIED", "Only a team lead or a super admin can change members");
    await db.tx(async (q) => {
      for (const m of members) if (!(await operatorExists(q, m.id))) throw badRequest("UNKNOWN_OPERATOR", "No such operator");
      const before = await q<{ principal_id: string; available: boolean }>(`SELECT principal_id, available FROM team_members WHERE team_id = $1`, [id]);
      await q(`DELETE FROM team_members WHERE team_id = $1`, [id]);
      for (const m of members) await q(`INSERT INTO team_members (team_id, principal_id, role, available) VALUES ($1,$2,$3,$4)`, [id, m.id, m.role, before.find((b) => b.principal_id === m.id)?.available ?? true]);
      await audit(q, tenant, { action: "team.members", actor: actorOf(req), request: req.info, resource: { type: "team", id, members: members.length } });
    });
    return { ok: true };
  });

  app.delete("/v1/manage/teams/:id", { preHandler: admin }, async (req) => {
    const { id } = req.params as { id: string };
    await db.tx(async (q) => {
      const r = await q(`DELETE FROM teams WHERE id = $1 AND tenant_id = $2 RETURNING key`, [id, tenant]);
      if (!r.length) throw notFound("Team");
      await audit(q, tenant, { action: "team.deleted", actor: actorOf(req), request: req.info, resource: { type: "team", id } });
    });
    return { ok: true };
  });

  app.post("/v1/manage/me/availability", { preHandler: agent }, async (req) => {
    const { team, available } = z.strictObject({ team: z.string().max(40), available: z.boolean() }).parse(req.body);
    await db.q(`UPDATE team_members SET available = $3 WHERE team_id = $1 AND principal_id = $2`, [team, req.principal!.id, available]);
    return { ok: true };
  });

  app.get("/v1/manage/me/prefs", { preHandler: requireOperator(deps, "viewer") }, async (req) => (await db.q<{ prefs: unknown }>(`SELECT prefs FROM principals WHERE id = $1`, [req.principal!.id]))[0]?.prefs ?? {});
  app.put("/v1/manage/me/prefs", { preHandler: requireOperator(deps, "viewer") }, async (req) => {
    const prefs = z.strictObject({ emailNotifications: z.boolean() }).parse(req.body);
    await db.q(`UPDATE principals SET prefs = prefs || $2::jsonb WHERE id = $1`, [req.principal!.id, JSON.stringify(prefs)]);
    return prefs;
  });

  // ── Notifications ──
  app.get("/v1/manage/notifications", { preHandler: requireOperator(deps, "viewer") }, async (req) => {
    const items = await db.q(`SELECT n.id, n.kind, n.text, n.read_at, n.created_at, t.number FROM notifications n LEFT JOIN tickets t ON t.id = n.ticket_id WHERE n.principal_id = $1 ORDER BY n.created_at DESC LIMIT 50`, [req.principal!.id]);
    const [{ unread }] = (await db.q<{ unread: number }>(`SELECT count(*)::int AS unread FROM notifications WHERE principal_id = $1 AND read_at IS NULL`, [req.principal!.id])) as [{ unread: number }];
    return { unread, items };
  });
  app.post("/v1/manage/notifications/read", { preHandler: requireOperator(deps, "viewer") }, async (req) => {
    const { ids } = z.strictObject({ ids: z.array(z.string().max(40)).max(200).optional() }).parse(req.body ?? {});
    await db.q(`UPDATE notifications SET read_at = clock_timestamp() WHERE principal_id = $1 AND read_at IS NULL ${ids ? "AND id = ANY($2)" : ""}`, ids ? [req.principal!.id, ids] : [req.principal!.id]);
    return { ok: true };
  });

  // ── Saved replies ──
  const Reply = z.strictObject({ title: z.string().trim().min(1).max(120), team: z.string().max(40).nullable(), body: z.strictObject({ fa: z.string().max(10_000).optional(), en: z.string().max(10_000).optional(), tr: z.string().max(10_000).optional() }) });
  app.get("/v1/manage/saved-replies", { preHandler: agent }, async () => db.q(`SELECT s.id, s.title, s.team_id AS team, s.body, s.created_by, s.created_at FROM saved_replies s WHERE s.tenant_id = $1 ORDER BY s.title`, [tenant]));
  app.post("/v1/manage/saved-replies", { preHandler: agent }, async (req) => {
    const b = Reply.parse(req.body);
    const id = ulid("rpl_");
    await db.tx(async (q) => {
      await q(`INSERT INTO saved_replies (id, tenant_id, team_id, title, body, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [id, tenant, b.team, b.title, JSON.stringify(b.body), req.principal!.id]);
      await audit(q, tenant, { action: "saved_reply.created", actor: actorOf(req), request: req.info, resource: { type: "saved_reply", id } });
    });
    return { id };
  });
  app.put("/v1/manage/saved-replies/:id", { preHandler: agent }, async (req) => {
    const { id } = req.params as { id: string };
    const b = Reply.parse(req.body);
    await db.tx(async (q) => {
      const r = await q(`UPDATE saved_replies SET title = $3, team_id = $4, body = $5 WHERE id = $1 AND tenant_id = $2 AND ($6::boolean OR created_by = $7) RETURNING id`, [id, tenant, b.title, b.team, JSON.stringify(b.body), req.principal!.role === "super_admin", req.principal!.id]);
      if (!r.length) throw notFound("Saved reply");
      await audit(q, tenant, { action: "saved_reply.updated", actor: actorOf(req), request: req.info, resource: { type: "saved_reply", id } });
    });
    return { ok: true };
  });
  app.delete("/v1/manage/saved-replies/:id", { preHandler: agent }, async (req) => {
    const { id } = req.params as { id: string };
    await db.tx(async (q) => {
      const r = await q(`DELETE FROM saved_replies WHERE id = $1 AND tenant_id = $2 AND ($3::boolean OR created_by = $4) RETURNING id`, [id, tenant, req.principal!.role === "super_admin", req.principal!.id]);
      if (!r.length) throw notFound("Saved reply");
      await audit(q, tenant, { action: "saved_reply.deleted", actor: actorOf(req), request: req.info, resource: { type: "saved_reply", id } });
    });
    return { ok: true };
  });

  app.get("/v1/manage/helpdesk/mailbox", { preHandler: agent }, async () => {
    const [state] = await db.q(`SELECT last_poll_at, last_error FROM mailbox_state WHERE tenant_id = $1`, [tenant]);
    const out = await db.q(`SELECT status, count(*)::int AS n FROM email_outbox WHERE tenant_id = $1 GROUP BY status`, [tenant]);
    return { address: config.SUPPORT_ADDRESS, inbound: !!config.IMAP_URL, outbound: !!config.SMTP_URL, state: state ?? null, outbox: Object.fromEntries(out.map((r) => [r.status, r.n])) };
  });
}
