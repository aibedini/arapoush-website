import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { definitionIssues, FIELD_TYPES, FILE_KINDS, fillTemplate, pickL, PRIORITIES, route, validateSubmission, type FormDefinition, type FormValue } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import type { Q } from "../db/index.ts";
import { badRequest, conflict, forbidden, notFound, Problem, unauthorized } from "../http/problem.ts";
import { safeEqual, ulid } from "../ids.ts";
import { checkPdf, clamScan, MIME, Rejected, sniff } from "../media/inspect.ts";
import { enqueueSiteWebhook } from "../webhooks/outbox.ts";
import { createTicket, enqueueEmail, pii, replyMessageId, type Requester } from "../tickets/service.ts";
import { starterDefinition, SYSTEM_FORMS } from "./system.ts";

const Loc = z.strictObject({ fa: z.string().max(4000).optional(), en: z.string().max(4000).optional(), tr: z.string().max(4000).optional() });
const Field = z.strictObject({
  id: z.string().max(40),
  type: z.enum(FIELD_TYPES),
  label: Loc,
  help: Loc.optional(),
  placeholder: Loc.optional(),
  required: z.boolean().optional(),
  width: z.enum(["full", "half"]).optional(),
  options: z.array(z.strictObject({ value: z.string().max(100), label: Loc })).max(100).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(200).optional(),
  showIf: z.strictObject({ field: z.string().max(40), op: z.enum(["eq", "neq", "in", "filled", "empty"]), value: z.union([z.string().max(100), z.array(z.string().max(100)).max(50)]).optional() }).optional(),
  role: z.enum(["name", "email", "phone", "company", "message"]).optional(),
  accept: z.array(z.enum(FILE_KINDS)).optional(),
  defaultValue: z.string().max(300).optional(),
});
const Rule = z.strictObject({
  when: z.strictObject({ field: z.string().max(40), op: z.enum(["eq", "neq", "contains", "in", "gte", "lte", "filled"]), value: z.union([z.string().max(100), z.array(z.string().max(100)).max(50)]).optional() }),
  set: z.strictObject({ team: z.string().max(40).optional(), priority: z.enum(PRIORITIES).optional(), assignee: z.string().max(40).optional(), tags: z.array(z.string().max(40)).max(10).optional() }),
});
export const Definition = z.strictObject({
  title: Loc,
  intro: Loc,
  submitLabel: Loc,
  success: Loc,
  fields: z.array(Field).max(60),
  settings: z.strictObject({
    team: z.string().max(40).nullable(),
    priority: z.enum(PRIORITIES),
    tags: z.array(z.string().max(40)).max(10),
    rules: z.array(Rule).max(30),
    notify: z.array(z.string().email().max(200)).max(10),
    confirmation: z.strictObject({ enabled: z.boolean(), subject: Loc, body: Loc }),
    page: z.strictObject({ enabled: z.boolean(), indexable: z.boolean(), title: Loc, description: Loc }),
    subject: z.string().max(300),
    retentionDays: z.number().int().min(30).max(3650),
    perIpLimit: z.number().int().min(1).max(100),
  }),
});
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "lowercase letters, digits and dashes");

type FormRow = { id: string; slug: string; status: string; system: boolean; draft: FormDefinition; published: FormDefinition | null; version: number; updated_at: Date; created_at: Date };

/** What the website gets: no routing, notify addresses or rules. */
export const publicDefinition = (slug: string, version: number, d: FormDefinition) => ({
  slug,
  version,
  title: d.title,
  intro: d.intro,
  submitLabel: d.submitLabel,
  success: d.success,
  fields: d.fields,
  page: d.settings.page,
});

export async function seedSystemForms(q: Q, tenant: string, notify: string[] = []) {
  for (const sf of SYSTEM_FORMS) {
    const f = { ...sf, definition: { ...sf.definition, settings: { ...sf.definition.settings, notify } } };
    const id = ulid("frm_");
    const r = await q(`INSERT INTO forms (id, tenant_id, slug, status, system, draft, published, version) VALUES ($1,$2,$3,'published',true,$4,$4,1) ON CONFLICT (tenant_id, slug) DO NOTHING RETURNING id`, [id, tenant, f.slug, JSON.stringify(f.definition)]);
    if (r.length) await q(`INSERT INTO form_versions (form_id, version, definition, published_by) VALUES ($1,1,$2,'system')`, [id, JSON.stringify(f.definition)]);
  }
  await q(`INSERT INTO teams (id, tenant_id, key, name) VALUES ($1,$2,'sales','فروش') ON CONFLICT DO NOTHING`, [ulid("team_"), tenant]);
}

/** Published forms for the delivery bundle (entries keyed `form.<slug>`). */
export async function publishedForms(q: Q, tenant: string) {
  const rows = await q<{ slug: string; version: number; published: FormDefinition }>(`SELECT slug, version, published FROM forms WHERE tenant_id = $1 AND status = 'published' AND published IS NOT NULL ORDER BY slug`, [tenant]);
  return rows.map((r) => ({ key: `form.${r.slug}`, version: r.version, data: publicDefinition(r.slug, r.version, r.published) }));
}

const MAX_FILE = 10 * 1024 * 1024;
const Submission = z.strictObject({
  locale: z.enum(["fa", "en", "tr"]),
  page: z.string().regex(/^\/[\w\-/]*$/).max(200),
  values: z.record(z.string().max(40), z.union([z.string().max(10_000), z.array(z.string().max(300)).max(100), z.boolean(), z.number()])),
  context: z.strictObject({ subject: z.string().max(300).optional(), spec: z.array(z.string().max(300)).max(30).optional() }).optional(),
  files: z.array(z.strictObject({ field: z.string().max(40), name: z.string().max(200), data: z.string().max(Math.ceil((MAX_FILE * 4) / 3) + 8) })).max(5).optional(),
  turnstile: z.string().max(4000).optional(),
});
// The P8 shape (quote sheet, contact), still accepted.
const Legacy = z.object({ locale: z.enum(["fa", "en", "tr"]), page: z.string(), subject: z.string().max(300), spec: z.array(z.string().max(300)).max(30).default([]), fields: z.record(z.string(), z.string().max(4000)), turnstile: z.string().optional() });
function normalize(body: unknown): z.infer<typeof Submission> {
  if (body && typeof body === "object" && "fields" in body && !("values" in body)) {
    const l = Legacy.parse(body);
    const { mobile, phone, ...rest } = l.fields;
    return Submission.parse({ locale: l.locale, page: l.page, values: { ...rest, ...((phone || mobile) ? { phone: phone || mobile } : {}) }, context: { subject: l.subject, spec: l.spec }, turnstile: l.turnstile });
  }
  return Submission.parse(body);
}

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

/** A readable copy of the answers (labels in the submitter's language) for emails and the timeline. */
export function answersText(def: FormDefinition, values: Record<string, FormValue>, locale: string) {
  return def.fields
    .filter((f) => values[f.id] !== undefined)
    .map((f) => {
      const v = values[f.id]!;
      const shown = Array.isArray(v) ? v.map((x) => pickL(f.options?.find((o) => o.value === x)?.label, locale) || x).join("، ") : typeof v === "boolean" ? "✓" : f.options ? pickL(f.options.find((o) => o.value === v)?.label, locale) || String(v) : String(v);
      return `${pickL(f.label, locale) || f.id}: ${shown}`;
    })
    .join("\n");
}

/**
 * Form builder (P11). Operators design forms in the console; published forms reach the website in
 * the delivery bundle. Every submission becomes a ticket (src/tickets).
 */
export async function formsModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const keys = pii(config);
  // P8 emailed sales on every request: the built-in forms keep doing that (INQUIRY_TO).
  await db.tx((q) => seedSystemForms(q, tenant, [config.INQUIRY_TO]));

  const site = (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };

  // ── Website ──
  app.get("/v1/delivery/forms/:slug", { preHandler: async (req) => site(req) }, async (req) => {
    const { slug } = req.params as { slug: string };
    const [f] = await db.q<FormRow>(`SELECT * FROM forms WHERE tenant_id = $1 AND slug = $2 AND status = 'published'`, [tenant, slug]);
    if (!f?.published) throw notFound("Form");
    return publicDefinition(f.slug, f.version, f.published);
  });

  app.post("/v1/delivery/forms/:slug", { bodyLimit: 16 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    site(req);
    const { slug } = req.params as { slug: string };
    const body = normalize(req.body);
    const [f] = await db.q<FormRow>(`SELECT * FROM forms WHERE tenant_id = $1 AND slug = $2 AND status = 'published'`, [tenant, slug]);
    if (!f?.published) throw badRequest("UNKNOWN_FORM", "No such form");
    const def = f.published;
    const ip = req.info.asserted_end_user_ip ?? null;
    if (config.TURNSTILE_SECRET && !(await turnstileOk(config.TURNSTILE_SECRET, body.turnstile, ip))) throw forbidden("CHALLENGE_FAILED", "The anti-spam check failed");
    if (ip) {
      const [{ n }] = (await db.q<{ n: number }>(`SELECT count(*)::int AS n FROM tickets WHERE tenant_id = $1 AND ip = $2 AND created_at > clock_timestamp() - interval '10 minutes'`, [tenant, ip])) as [{ n: number }];
      if (n >= def.settings.perIpLimit) throw new Problem(429, "TOO_MANY_INQUIRIES", "Too many requests from this address; try again later");
    }

    const fileCount: Record<string, number> = {};
    for (const x of body.files ?? []) fileCount[x.field] = (fileCount[x.field] ?? 0) + 1;
    const { values, errors } = validateSubmission(def, body.values, fileCount);
    if (Object.keys(errors).length) throw badRequest("INVALID_SUBMISSION", "Some answers are not valid", { issues: Object.entries(errors).map(([path, message]) => ({ path, message })) });

    // Files: allowed kinds only, PDFs checked, everything scanned when ClamAV is configured.
    const files: { field: string; name: string; mime: string; buf: Buffer; scan: string }[] = [];
    for (const x of body.files ?? []) {
      const buf = Buffer.from(x.data, "base64");
      const field = def.fields.find((ff) => ff.id === x.field)!;
      const kind = sniff(buf);
      if (buf.length > MAX_FILE || !kind || !(field.accept ?? ["pdf", "jpeg", "png", "webp"]).includes(kind as never)) throw badRequest("INVALID_SUBMISSION", "File not accepted", { issues: [{ path: x.field, message: "bad_file" }] });
      try {
        if (kind === "pdf") checkPdf(buf);
      } catch (e) {
        throw badRequest("INVALID_SUBMISSION", e instanceof Rejected ? e.message : "File not accepted", { issues: [{ path: x.field, message: "bad_file" }] });
      }
      let scan = "skipped";
      if (config.CLAMAV) {
        scan = await clamScan(config.CLAMAV, buf).catch(() => {
          throw new Problem(503, "SCANNER_UNAVAILABLE", "Try again later");
        });
        if (scan.startsWith("infected")) throw badRequest("INVALID_SUBMISSION", "File not accepted", { issues: [{ path: x.field, message: "bad_file" }] });
      }
      files.push({ field: x.field, name: x.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "file", mime: MIME[kind], buf, scan });
    }

    const roleVal = (role: string) => {
      const id = def.fields.find((ff) => ff.role === role)?.id;
      const v = id ? values[id] : undefined;
      return typeof v === "string" ? v : undefined;
    };
    const requester: Requester = { name: roleVal("name"), email: roleVal("email"), phone: roleVal("phone"), company: roleVal("company") };
    if (requester.email) {
      const [b] = await db.q(`SELECT 1 FROM sender_blocks WHERE tenant_id = $1 AND hash = $2 AND until > clock_timestamp()`, [tenant, keys.hashEmail(requester.email)]);
      if (b) return reply.status(202).send({ ok: true }); // blocked as spam: accepted silently, nothing stored
    }
    const subject = (body.context?.subject?.trim() || fillTemplate(def.settings.subject, values).trim() || pickL(def.title, body.locale)).slice(0, 300);
    const routed = route(def, values);
    const summary = answersText(def, values, body.locale);
    const spec = body.context?.spec ?? [];

    const t = await db.tx(async (q) => {
      const t = await createTicket(q, keys, config, {
        channel: "form",
        formId: f.id,
        formVersion: f.version,
        data: { subject, requester, values, context: spec.length ? { spec } : undefined },
        team: routed.team,
        priority: routed.priority,
        assignee: routed.assignee,
        tags: routed.tags,
        locale: body.locale,
        page: body.page,
        ip,
        retentionDays: def.settings.retentionDays,
        first: { kind: "submitted", body: { text: [...spec, ...(spec.length ? [""] : []), summary].join("\n") } },
      });
      for (const x of files) {
        const id = ulid("att_");
        const enc = keys.encrypt(id, x.buf.toString("base64"));
        await q(`INSERT INTO ticket_attachments (id, tenant_id, ticket_id, event_id, field, name, mime, bytes, data_enc, key_id, scan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, tenant, t.id, t.eventId, x.field, x.name, x.mime, x.buf.length, enc.payload, enc.keyId, x.scan]);
      }
      // Copies to the form's notify list (as P8 emailed sales), with the answers.
      for (const to of def.settings.notify)
        await enqueueEmail(q, keys, tenant, { kind: "form.notify", ticketId: t.id, to, replyTo: requester.email, subject: `[#${t.number}] ${subject}`.replace(/[\r\n]+/g, " ").slice(0, 200), text: `${subject}\n\n${spec.join("\n")}${spec.length ? "\n\n" : ""}${summary}\n\nPage: ${body.page} (${body.locale})\n${config.CONSOLE_URL}/tickets/${t.number}\n` });
      // Confirmation to the visitor: their reply threads back into this ticket.
      if (def.settings.confirmation.enabled && requester.email) {
        const vars = { number: String(t.number), name: requester.name ?? "" };
        await enqueueEmail(q, keys, tenant, {
          kind: "confirmation",
          ticketId: t.id,
          to: requester.email,
          from: `"${config.SUPPORT_NAME}" <${config.SUPPORT_ADDRESS}>`,
          messageId: replyMessageId(config, t.eventId),
          subject: `${fillTemplate(pickL(def.settings.confirmation.subject, body.locale) || subject, values, vars)} [#${t.number}]`.replace(/[\r\n]+/g, " ").slice(0, 200),
          text: fillTemplate(pickL(def.settings.confirmation.body, body.locale), values, vars),
        });
        await q(`UPDATE ticket_events SET message_id = $2 WHERE id = $1`, [t.eventId, replyMessageId(config, t.eventId)]);
      }
      // No personal data in the audit log.
      await audit(q, tenant, { action: "ticket.created", actor: { kind: "anonymous", id: null, display: "Website visitor" }, request: req.info, resource: { type: "ticket", id: t.id, number: t.number, form: slug, locale: body.locale, page: body.page, files: files.length } });
      return t;
    });
    reply.status(201);
    return { id: t.id, number: t.number };
  });

  // ── Console ──
  const read = requireOperator(deps, "viewer");
  const write = requireOperator(deps, "operator");
  const load = async (id: string) => {
    const [f] = await db.q<FormRow>(`SELECT * FROM forms WHERE id = $1 AND tenant_id = $2`, [id, tenant]);
    if (!f) throw notFound("Form");
    return f;
  };

  app.get("/v1/manage/forms", { preHandler: read }, async () => {
    const rows = await db.q<FormRow & { open: number; total: number }>(
      `SELECT f.*, (SELECT count(*)::int FROM tickets t WHERE t.form_id = f.id AND t.status IN ('new','open','pending','on_hold')) AS open, (SELECT count(*)::int FROM tickets t WHERE t.form_id = f.id) AS total
         FROM forms f WHERE f.tenant_id = $1 ORDER BY f.system DESC, f.updated_at DESC`,
      [tenant],
    );
    return rows.map((f) => ({ id: f.id, slug: f.slug, status: f.status, system: f.system, version: f.version, title: f.draft.title, fields: f.draft.fields.length, dirty: JSON.stringify(f.draft) !== JSON.stringify(f.published), page: f.draft.settings.page.enabled, open: f.open, total: f.total, updated_at: f.updated_at }));
  });

  app.post("/v1/manage/forms", { preHandler: write }, async (req) => {
    const { slug, title } = z.strictObject({ slug: Slug, title: z.string().min(1).max(200) }).parse(req.body);
    const id = ulid("frm_");
    await db.tx(async (q) => {
      const r = await q(`INSERT INTO forms (id, tenant_id, slug, draft, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT DO NOTHING RETURNING id`, [id, tenant, slug, JSON.stringify(starterDefinition(title)), req.principal!.id]);
      if (!r.length) throw conflict("SLUG_TAKEN", "A form with this address exists");
      await audit(q, tenant, { action: "form.created", actor: actorOf(req), request: req.info, resource: { type: "form", id, slug } });
    });
    return { id };
  });

  app.get("/v1/manage/forms/:id", { preHandler: read }, async (req) => {
    const f = await load((req.params as { id: string }).id);
    const versions = await db.q(`SELECT v.version, v.published_at, p.display_name AS by FROM form_versions v LEFT JOIN principals p ON p.id = v.published_by WHERE v.form_id = $1 ORDER BY v.version DESC LIMIT 50`, [f.id]);
    const teams = await db.q(`SELECT id, key, name FROM teams WHERE tenant_id = $1 ORDER BY name`, [tenant]);
    return { form: { id: f.id, slug: f.slug, status: f.status, system: f.system, version: f.version, updated_at: f.updated_at }, draft: f.draft, published: f.published, issues: definitionIssues(f.draft), versions, teams };
  });

  app.put("/v1/manage/forms/:id/draft", { preHandler: write }, async (req) => {
    const f = await load((req.params as { id: string }).id);
    const { definition, version } = z.strictObject({ definition: Definition, version: z.string() }).parse(req.body);
    // Optimistic lock: the updated_at the editor loaded.
    if (new Date(version).getTime() !== new Date(f.updated_at).getTime()) throw conflict("CONFLICT_BASE_REVISION", "The form changed since you opened it");
    const def = definition as FormDefinition;
    const [r] = await db.tx(async (q) => {
      const r = await q<{ updated_at: Date }>(`UPDATE forms SET draft = $2, updated_by = $3, updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at`, [f.id, JSON.stringify(def), req.principal!.id]);
      await audit(q, tenant, { action: "form.draft_saved", actor: actorOf(req), request: req.info, resource: { type: "form", id: f.id, slug: f.slug, fields: def.fields.length } });
      return r;
    });
    return { updated_at: r!.updated_at, issues: definitionIssues(def) };
  });

  app.post("/v1/manage/forms/:id/publish", { preHandler: write }, async (req) => {
    const f = await load((req.params as { id: string }).id);
    const issues = definitionIssues(f.draft);
    const teamKeys = new Set((await db.q<{ key: string }>(`SELECT key FROM teams WHERE tenant_id = $1`, [tenant])).map((t) => t.key));
    for (const k of [f.draft.settings.team, ...f.draft.settings.rules.map((r) => r.set.team)]) if (k && !teamKeys.has(k)) issues.push({ path: "settings.team", message: `Unknown team "${k}"` });
    if (issues.length) throw badRequest("FORM_INVALID", "Fix the form before publishing", { issues });
    const version = f.version + 1;
    await db.tx(async (q) => {
      await q(`UPDATE forms SET published = draft, status = 'published', version = $2, updated_at = clock_timestamp(), updated_by = $3 WHERE id = $1`, [f.id, version, req.principal!.id]);
      await q(`INSERT INTO form_versions (form_id, version, definition, published_by) VALUES ($1,$2,$3,$4)`, [f.id, version, JSON.stringify(f.draft), req.principal!.id]);
      await enqueueSiteWebhook(q, tenant, "content.published", { types: [`form.${f.slug}`] });
      await audit(q, tenant, { action: "form.published", actor: actorOf(req), request: req.info, resource: { type: "form", id: f.id, slug: f.slug, version } });
    });
    return { version };
  });

  app.post("/v1/manage/forms/:id/status", { preHandler: write }, async (req) => {
    const f = await load((req.params as { id: string }).id);
    const { archived } = z.strictObject({ archived: z.boolean() }).parse(req.body);
    if (f.system && archived) throw forbidden("SYSTEM_FORM", "Built-in forms cannot be archived");
    const status = archived ? "archived" : f.published ? "published" : "draft";
    await db.tx(async (q) => {
      await q(`UPDATE forms SET status = $2, updated_at = clock_timestamp() WHERE id = $1`, [f.id, status]);
      await enqueueSiteWebhook(q, tenant, "content.published", { types: [`form.${f.slug}`] });
      await audit(q, tenant, { action: archived ? "form.archived" : "form.restored", actor: actorOf(req), request: req.info, resource: { type: "form", id: f.id, slug: f.slug } });
    });
    return { status };
  });

  app.post("/v1/manage/forms/:id/duplicate", { preHandler: write }, async (req) => {
    const f = await load((req.params as { id: string }).id);
    const { slug } = z.strictObject({ slug: Slug }).parse(req.body);
    const id = ulid("frm_");
    await db.tx(async (q) => {
      const r = await q(`INSERT INTO forms (id, tenant_id, slug, draft, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT DO NOTHING RETURNING id`, [id, tenant, slug, JSON.stringify(f.draft), req.principal!.id]);
      if (!r.length) throw conflict("SLUG_TAKEN", "A form with this address exists");
      await audit(q, tenant, { action: "form.created", actor: actorOf(req), request: req.info, resource: { type: "form", id, slug, from: f.id } });
    });
    return { id };
  });

  app.get("/v1/manage/forms/:id/versions/:v", { preHandler: read }, async (req) => {
    const { id, v } = req.params as { id: string; v: string };
    const [r] = await db.q(`SELECT definition FROM form_versions WHERE form_id = $1 AND version = $2`, [id, Number(v)]);
    if (!r) throw notFound("Version");
    await auditNow(db, tenant, { action: "form.version_read", actor: actorOf(req), request: req.info, resource: { type: "form", id, version: Number(v) } });
    return r;
  });
}
