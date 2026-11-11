import { z } from "zod";
import { Iso, route } from "../openapi/contract.ts";

export const AuditFilters = z.object({
  action: z.string().max(80).optional().describe("Exact action or a prefix ending in `.`, e.g. `ticket.`"),
  actor: z.string().max(80).optional().describe("Principal id or display name."),
  client: z.string().max(80).optional().describe("OAuth client (AraCMS) id."),
  ip: z.string().max(64).optional(),
  resource: z.string().max(120).optional().describe("Resource id or type."),
  path: z.string().max(200).optional().describe("Field path touched by a change."),
  result: z.enum(["success", "failure", "denied"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  before: z.coerce.number().int().optional().describe("Paging: events with seq below this."),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const Seq = z.union([z.number(), z.string()]).describe("Sequence number (bigint; a string from Postgres).");
const Event = z
  .object({
    seq: Seq,
    id: z.string(),
    ts: Iso,
    action: z.string(),
    result: z.enum(["success", "failure", "denied"]),
    actor: z.record(z.string(), z.unknown()).describe("kind, id, display, roles, via_client, session_id, auth"),
    request: z.record(z.string(), z.unknown()).describe("id, ip, ip_chain, asserted_end_user_ip, user_agent, method, path"),
    resource: z.record(z.string(), z.unknown()).nullable(),
    changes: z.array(z.unknown()).nullable(),
    reason: z.string().nullable(),
    hash: z.string(),
  })
  .meta({ id: "AuditEvent" });

const S = "audit/routes.ts";
const tags = ["Audit"];
const N = z.number();
export const AUDIT = {
  search: route({
    id: "searchAudit",
    method: "GET",
    path: "/v1/manage/audit",
    audience: "manage",
    tags,
    summary: "Search the audit log (who, what, where, when)",
    auth: "session",
    role: "auditor",
    source: S,
    query: AuditFilters,
    responses: { 200: { description: "Newest first.", schema: z.array(Event) } },
  }),
  verify: route({
    id: "verifyAudit",
    method: "GET",
    path: "/v1/manage/audit/verify",
    audience: "manage",
    tags,
    summary: "Recompute the hash chain over a range",
    auth: "session",
    role: "auditor",
    source: S,
    query: z.object({ from: z.coerce.number().int().min(1).default(1), to: z.coerce.number().int().optional() }),
    responses: { 200: { description: "`ok: false` names the first event whose hash does not match.", schema: z.object({ ok: z.boolean(), checked: N, firstBad: N.optional(), head: z.object({ seq: N, hash: z.string() }).optional() }) } },
    audit: ["audit.verify"],
  }),
  exportLog: route({
    id: "exportAudit",
    method: "GET",
    path: "/v1/manage/audit/export",
    audience: "manage",
    tags,
    summary: "Export matching events as JSON Lines (up to 50,000)",
    auth: "session",
    role: "auditor",
    stepUp: true,
    source: S,
    query: AuditFilters.omit({ limit: true }),
    responses: { 200: { description: "One event per line, oldest first (a download).", contentType: "application/x-ndjson", headers: { "Content-Disposition": 'attachment; filename="opex-audit-YYYY-MM-DD.jsonl"' } } },
    audit: ["audit.export"],
  }),
  dashboard: route({
    id: "dashboard",
    method: "GET",
    path: "/v1/manage/dashboard",
    audience: "manage",
    tags: ["Dashboard"],
    summary: "Console home: counts and the latest events",
    auth: "session",
    role: "viewer",
    source: S,
    responses: {
      200: {
        description: "Counters.",
        schema: z.object({
          crs: z.object({ pending: N, rebase: N, approved7d: N }).partial(),
          entries: z.object({ total: N, unpublished: N, scheduled: N }).partial(),
          security24h: z.object({ failed_logins: N, denies: N, lockouts: N }).partial(),
          webhooks: z.object({ retrying: N, dead: N }).partial(),
          auditHead: z.object({ seq: z.string(), hash: z.string() }).partial(),
          tickets: z.object({ open: N, new: N, unassigned: N, overdue: N, week: N }).partial(),
          recent: z.array(z.object({ seq: Seq, ts: Iso, action: z.string(), result: z.string(), who: z.string().nullable(), kind: z.string().nullable(), ip: z.string().nullable(), resource: z.record(z.string(), z.unknown()).nullable() })),
        }),
      },
    },
  }),
};
