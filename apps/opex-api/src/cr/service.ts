import { CrInputSchema, ItemInputSchema } from "../partner/contract.ts";
import { fieldAt, getAt, isLocalizedText, LOCALES, setAt, type GroupField } from "@arapoush/schema";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { audit, type Actor, type RequestInfo } from "../audit/audit.ts";
import type { Q } from "../db/index.ts";
import { Problem, badRequest, conflict, forbidden, notFound } from "../http/problem.ts";
import { ulid } from "../ids.ts";
import { evaluate, splitLocale, type Grant, type GrantAction } from "../authz/grants.ts";
import { getEntry, getRevision, publish, saveDraft, typeOrThrow, validateOrThrow } from "../content/service.ts";
import { extOf } from "../media/service.ts";
import { enqueueWebhook } from "../webhooks/outbox.ts";
import { applyItems, same, type Conflict, type Item } from "./merge.ts";
import { evaluatePolicies, type CrItem, type Outcome, type Policy } from "./policy.ts";

/** Plan §7.2. Every transition goes through this module, under a row lock, audited and notified. */
export type CrState = "submitted" | "pending_review" | "approved" | "published" | "rejected" | "withdrawn" | "needs_rebase" | "expired";
export const OPEN: CrState[] = ["submitted", "pending_review", "needs_rebase"];

export type CrRow = {
  id: string;
  tenant_id: string;
  partner_client_id: string | null;
  author_principal_id: string;
  title: string;
  note: string | null;
  state: CrState;
  decision: Outcome | null;
  conflicts: Conflict[] | null;
  approvals: { by: string; at: string }[];
  four_eyes: boolean;
  created_at: Date;
  updated_at: Date;
};
export type ItemRow = { id: string; cr_id: string; entry_id: string; type_key: string; base_revision_id: string; path: string; op: Item["op"]; old_value: unknown; new_value: unknown; decision: "approved" | "rejected" | null; decision_reason: string | null; added_by: string | null; position: number };

// Request shapes live in the API contract (documented in OpenAPI); re-exported for the service.
export const ItemInput = ItemInputSchema;
export const CrInput = CrInputSchema;

type Author = { actor: Actor; request: RequestInfo; principalId: string; role: string | null; partnerClientId: string | null; partnerClientKey: string; grants: Grant[] | null };

/** `{ asset: "ast_…", alt }` in a proposed value becomes a real image value pointing at that upload. */
async function resolveAssets(q: Q, tenant: string, v: unknown, partnerClientId: string | null, found: string[]): Promise<unknown> {
  if (Array.isArray(v)) return Promise.all(v.map((x) => resolveAssets(q, tenant, x, partnerClientId, found)));
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (typeof o.asset === "string" && Object.keys(o).every((k) => k === "asset" || k === "alt")) {
    const [a] = await q<{ id: string; mime: string; width: number | null; height: number | null; public: boolean; partner: string | null }>(
      `SELECT a.id, a.mime, a.width, a.height, a.public, p.partner_client_id AS partner FROM assets a LEFT JOIN principals p ON p.id = a.uploaded_by WHERE a.id = $1 AND a.tenant_id = $2`,
      [o.asset, tenant],
    );
    // Partners may use their own uploads or media that is already public.
    if (!a || (partnerClientId && !a.public && a.partner !== partnerClientId)) throw badRequest("UNKNOWN_ASSET", `Asset ${String(o.asset)} not found`);
    found.push(a.id);
    return { src: `/media/${a.id}.${extOf(a.mime)}`, ...(a.width ? { width: a.width, height: a.height } : {}), ...(o.alt ? { alt: o.alt } : {}) };
  }
  return Object.fromEntries(await Promise.all(Object.entries(o).map(async ([k, x]) => [k, await resolveAssets(q, tenant, x, partnerClientId, found)] as const)));
}

const actionFor = (op: Item["op"]): GrantAction => (op === "insert" ? "entry.create" : op === "remove" ? "entry.delete" : "propose");

/** Checks one item against the grants (partners only); localized text needs every touched locale. */
function authorize(grants: Grant[] | null, schema: GroupField, type: string, path: string, value: unknown, op: Item["op"]) {
  if (!grants) return; // operators: full access (locks are enforced on save)
  const { path: bare, locale } = splitLocale(path);
  const f = fieldAt(schema, bare);
  const locales = locale ? [locale] : f?.kind === "text" && f.localized ? (isLocalizedText(value) ? Object.keys(value) : [...LOCALES]) : [null];
  for (const l of locales) {
    const d = evaluate(grants, schema, { type, path: bare, locale: l, action: actionFor(op) });
    if (!d.allow) throw forbidden(d.reason === "locked" ? "FIELD_LOCKED" : "GRANT_DENIED", `${path}${l && !locale ? `@${l}` : ""}: ${d.reason}`, { path, reason: d.reason });
  }
}

/** Builds and validates the items: old values from the base revision, sanitised new values. */
async function prepare(q: Q, tenant: string, input: z.infer<typeof ItemInput>[], who: Author) {
  const items: (Omit<ItemRow, "id" | "cr_id" | "decision" | "decision_reason" | "added_by"> & { kind?: string; newAssets: string[] })[] = [];
  const byEntry = new Map<string, { type: string; schema: GroupField; base: Record<string, unknown>; idx: number[] }>();
  for (const [i, it] of input.entries()) {
    const t = typeOrThrow(it.entry);
    const entry = await getEntry(q, tenant, it.entry);
    const base = await getRevision(q, it.base_revision_id).catch(() => null);
    if (!base || base.entry_id !== entry.id) throw badRequest("BAD_BASE_REVISION", `items[${i}]: base_revision_id does not belong to ${it.entry}`);
    const path = it.locale && !it.path.includes("@") ? `${it.path}@${it.locale}` : it.path;
    const f = fieldAt(t.schema, splitLocale(path).path);
    if (!f) throw badRequest("PATH_NOT_FOUND", `items[${i}]: ${path} is not a field of ${it.entry}`);
    if (it.op !== "remove" && it.value === undefined) throw badRequest("VALUE_REQUIRED", `items[${i}]: value is required`);
    const newAssets: string[] = [];
    const value = it.op === "remove" ? null : await resolveAssets(q, tenant, it.value, who.partnerClientId, newAssets);
    authorize(who.grants, t.schema, it.entry, path, value, it.op);
    const old = getAt(base.data, path) ?? null;
    if (it.op === "set" && getAt(base.data, splitLocale(path).path) === undefined && !splitLocale(path).locale) throw badRequest("PATH_NOT_FOUND", `items[${i}]: ${path} does not exist`);
    if (it.op === "remove" && old === null) throw badRequest("PATH_NOT_FOUND", `items[${i}]: ${path} does not exist`);
    items.push({ entry_id: entry.id, type_key: it.entry, base_revision_id: base.id, path, op: it.op, old_value: it.op === "insert" ? null : old, new_value: value, position: i, kind: f.kind, newAssets });
    const g = byEntry.get(entry.id) ?? { type: it.entry, schema: t.schema, base: base.data, idx: [] };
    g.idx.push(items.length - 1);
    byEntry.set(entry.id, g);
  }
  // Validate each entry with the items applied; store the sanitised values (NFC, Persian letters…).
  for (const g of byEntry.values()) {
    const list = g.idx.map((k) => ({ id: String(k), path: items[k]!.path, op: items[k]!.op, old: items[k]!.old_value, value: items[k]!.new_value }));
    let applied: unknown;
    try {
      applied = applyItems(g.base, list).data;
    } catch (e) {
      throw badRequest("PATH_NOT_FOUND", (e as Error).message);
    }
    const clean = validateOrThrow(typeOrThrow(g.type), applied);
    for (const k of g.idx) {
      const it = items[k]!;
      if (it.op === "set") it.new_value = getAt(clean, it.path) ?? it.new_value;
      if (it.op === "insert") it.new_value = (getAt(clean, it.path) as unknown[]).at(-1) ?? it.new_value;
    }
  }
  return items;
}

async function notify(q: Q, cr: Pick<CrRow, "id" | "tenant_id" | "partner_client_id">, state: CrState, extra: Record<string, unknown> = {}) {
  if (cr.partner_client_id) await enqueueWebhook(q, cr.tenant_id, `partner:${cr.partner_client_id}`, "cr.state_changed", { cr: cr.id, state, ...extra });
}

async function transition(q: Q, cr: CrRow, to: CrState, who: { actor: Actor; request: RequestInfo }, set: Record<string, unknown> = {}, reason?: string) {
  const cols = { state: to, ...set };
  const keys = Object.keys(cols);
  await q(`UPDATE change_requests SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = clock_timestamp() WHERE id = $1`, [cr.id, ...keys.map((k) => (typeof (cols as Record<string, unknown>)[k] === "object" && (cols as Record<string, unknown>)[k] !== null && !((cols as Record<string, unknown>)[k] instanceof Date) ? JSON.stringify((cols as Record<string, unknown>)[k]) : (cols as Record<string, unknown>)[k]))]);
  await audit(q, cr.tenant_id, { action: `cr.${to}`, actor: who.actor, request: who.request, resource: { type: "change_request", id: cr.id, from: cr.state, to, partner: cr.partner_client_id }, reason });
  await notify(q, cr, to, set.conflicts ? { conflicts: set.conflicts } : {});
  cr.state = to;
}

export async function lockCr(q: Q, tenant: string, id: string) {
  const [cr] = await q<CrRow>(`SELECT * FROM change_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, tenant]);
  if (!cr) throw notFound("Change request");
  return cr;
}

export async function itemsOf(q: Q, crId: string) {
  return q<ItemRow>(`SELECT ci.*, e.type_key FROM change_items ci JOIN entries e ON e.id = ci.entry_id WHERE ci.cr_id = $1 ORDER BY ci.position, ci.id`, [crId]);
}

const toCrItems = (items: (ItemRow & { kind?: string; newAssets?: string[] })[]): CrItem[] =>
  items.map((i) => ({ type: i.type_key, path: i.path, op: i.op, old: i.old_value, value: i.new_value, kind: i.kind, newAssets: i.newAssets ?? JSON.stringify(i.new_value ?? null).match(/ast_[0-9A-Z]{26}/g) ?? [] }));

/** Policy decision for a CR (also used by the console's simulator). */
export async function decide(q: Q, tenant: string, items: CrItem[], who: { principalId: string; role: string | null; partnerClientKey: string }): Promise<Outcome> {
  const policies = await q<Policy>(`SELECT id, name, priority, scope, conditions, effect, auto_publish, enabled FROM approval_policies WHERE tenant_id = $1 AND enabled`, [tenant]);
  const [{ n }] = (await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM change_requests WHERE tenant_id = $1 AND author_principal_id = $2 AND decision->>'effect' = 'auto_approve' AND created_at > clock_timestamp() - interval '1 hour'`,
    [tenant, who.principalId],
  )) as [{ n: number }];
  const assets = [...new Set(items.flatMap((i) => i.newAssets ?? []))];
  const pending = assets.length ? (await q(`SELECT 1 FROM assets WHERE id = ANY($1) AND status <> 'clean'`, [assets])).length > 0 : false;
  return evaluatePolicies(items, policies, { partner: who.partnerClientKey, principal: who.principalId, role: who.role, now: new Date(), autoApprovedLastHour: n, assetsPending: pending });
}

/** Creates a CR, runs the policy engine and, when it auto-approves, applies (and maybe publishes) it. */
export async function createCr(deps: Deps, input: z.infer<typeof CrInput>, who: Author, idempotencyKey: string | null) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  return db.tx(async (q) => {
    const items = await prepare(q, tenant, input.items, who);
    const id = ulid("cr_");
    await q(`INSERT INTO change_requests (id, tenant_id, partner_client_id, author_principal_id, title, note, state, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7)`, [id, tenant, who.partnerClientId, who.principalId, input.title, input.note ?? null, idempotencyKey]);
    for (const it of items)
      await q(`INSERT INTO change_items (id, cr_id, entry_id, base_revision_id, path, op, old_value, new_value, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [ulid("cit_"), id, it.entry_id, it.base_revision_id, it.path, it.op, JSON.stringify(it.old_value), JSON.stringify(it.new_value), it.position]);
    await audit(q, tenant, {
      action: "cr.submitted",
      actor: who.actor,
      request: who.request,
      resource: { type: "change_request", id, title: input.title, partner: who.partnerClientId, entries: [...new Set(items.map((i) => i.type_key))] },
      changes: items.map((i) => ({ op: i.op, path: `${i.type_key}${i.path}`, old: i.old_value, new: i.new_value })),
    });
    const outcome = await decide(q, tenant, toCrItems(items as never), who);
    const cr = await lockCr(q, tenant, id);
    await q(`UPDATE change_requests SET decision = $2, four_eyes = $3 WHERE id = $1`, [id, JSON.stringify(outcome), outcome.fourEyes]);
    await audit(q, tenant, { action: "cr.policy_decision", actor: who.actor, request: who.request, resource: { type: "change_request", id, effect: outcome.effect, policy: outcome.policy, reasons: outcome.reasons, autoPublish: outcome.autoPublish } });
    const system = { actor: { kind: "system" as const, id: "policy", display: `Policy ${outcome.policy ?? "default"}` }, request: who.request };
    if (outcome.effect === "deny") await transition(q, cr, "rejected", system, { decision_reason: outcome.reasons.join("; ") }, "denied by policy");
    else if (outcome.effect === "auto_approve") await approveLocked(q, tenant, cr, system, { publish: outcome.autoPublish });
    else await transition(q, cr, "pending_review", system);
    return { id, state: cr.state, decision: outcome, conflicts: cr.conflicts ?? undefined };
  });
}

/**
 * Approves (fully or partly) a locked CR: three-way merge onto the current drafts, one revision per
 * entry (`via_cr_id`), optionally published. Conflicts move it to needs_rebase instead.
 */
async function approveLocked(q: Q, tenant: string, cr: CrRow, who: { actor: Actor; request: RequestInfo }, o: { publish?: boolean; decisions?: Record<string, { decision: "approved" | "rejected"; reason?: string }>; operatorId?: string }) {
  if (cr.state !== "submitted" && cr.state !== "pending_review") throw conflict("CR_STATE", `Change request is ${cr.state}`);
  const all = await itemsOf(q, cr.id);
  for (const [itemId, d] of Object.entries(o.decisions ?? {})) {
    if (!all.some((i) => i.id === itemId)) throw badRequest("UNKNOWN_ITEM", `Item ${itemId} is not part of this change request`);
    await q(`UPDATE change_items SET decision = $2, decision_reason = $3 WHERE id = $1`, [itemId, d.decision, d.reason ?? null]);
    const it = all.find((i) => i.id === itemId)!;
    it.decision = d.decision;
  }
  // Four-eyes: the first operator approval is recorded; a second, different operator completes it.
  if (cr.four_eyes && o.operatorId) {
    const approvals = [...(cr.approvals ?? [])];
    if (!approvals.some((a) => a.by === o.operatorId)) approvals.push({ by: o.operatorId, at: new Date().toISOString() });
    await q(`UPDATE change_requests SET approvals = $2 WHERE id = $1`, [cr.id, JSON.stringify(approvals)]);
    await audit(q, tenant, { action: "cr.approval_recorded", actor: who.actor, request: who.request, resource: { type: "change_request", id: cr.id, approvals: approvals.length } });
    if (approvals.length < 2) return;
  }
  const approved = all.filter((i) => i.decision !== "rejected");
  if (!approved.length) return transition(q, cr, "rejected", who, { decided_by: who.actor.id, decided_at: new Date() }, "all items rejected");

  const byEntry = new Map<string, ItemRow[]>();
  for (const i of approved) byEntry.set(i.type_key, [...(byEntry.get(i.type_key) ?? []), i]);
  const merged: { type: string; data: unknown }[] = [];
  const conflicts: Conflict[] = [];
  for (const [type, list] of byEntry) {
    const entry = await getEntry(q, tenant, type, "main", true);
    const current = entry.draft_revision_id ? (await getRevision(q, entry.draft_revision_id)).data : {};
    const r = applyItems(current, list.map((i) => ({ id: i.id, path: i.path, op: i.op, old: i.old_value, value: i.new_value })));
    conflicts.push(...r.conflicts.map((c) => ({ ...c, path: `${type}${c.path}` })));
    merged.push({ type, data: r.data });
  }
  if (conflicts.length) return transition(q, cr, "needs_rebase", who, { conflicts }, "content changed since the request was made");

  for (const i of approved) if (!i.decision) await q(`UPDATE change_items SET decision = 'approved' WHERE id = $1`, [i.id]);
  for (const m of merged) await saveDraft(q, tenant, { typeKey: m.type, data: m.data, baseRevisionId: null, skipConcurrency: true, actor: who.actor, request: who.request, viaCr: cr.id, note: `CR: ${cr.title}` });
  await transition(q, cr, "approved", who, { decided_by: who.actor.id, decided_at: new Date() });
  if (o.publish) {
    for (const m of merged) await publish(q, tenant, { typeKey: m.type, actor: who.actor, request: who.request, trigger: "cr" });
    await transition(q, cr, "published", who, { published_at: new Date() });
  }
}

type Who = { actor: Actor; request: RequestInfo };

export async function approveCr(deps: Deps, id: string, who: Who & { operatorId: string }, o: { publish?: boolean; decisions?: Record<string, { decision: "approved" | "rejected"; reason?: string }> }) {
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, deps.config.TENANT, id);
    await approveLocked(q, deps.config.TENANT, cr, who, { ...o, operatorId: who.operatorId });
    return { id, state: cr.state, conflicts: cr.state === "needs_rebase" ? (await lockCr(q, deps.config.TENANT, id)).conflicts : undefined };
  });
}

/** Publishes an approved CR's entries (operator, after review). */
export async function publishCr(deps: Deps, id: string, who: Who) {
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, deps.config.TENANT, id);
    if (cr.state !== "approved") throw conflict("CR_STATE", `Change request is ${cr.state}`);
    const types = [...new Set((await itemsOf(q, id)).filter((i) => i.decision === "approved").map((i) => i.type_key))];
    for (const type of types) await publish(q, deps.config.TENANT, { typeKey: type, actor: who.actor, request: who.request, trigger: "cr" });
    await transition(q, cr, "published", who, { published_at: new Date() });
    return { id, state: cr.state };
  });
}

export async function rejectCr(deps: Deps, id: string, who: Who, reason: string) {
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, deps.config.TENANT, id);
    if (!OPEN.includes(cr.state)) throw conflict("CR_STATE", `Change request is ${cr.state}`);
    await q(`UPDATE change_items SET decision = 'rejected', decision_reason = COALESCE(decision_reason, $2) WHERE cr_id = $1 AND decision IS NULL`, [id, reason]);
    await transition(q, cr, "rejected", who, { decided_by: who.actor.id, decided_at: new Date(), decision_reason: reason }, reason);
    return { id, state: cr.state };
  });
}

export async function withdrawCr(deps: Deps, id: string, who: Who & { principalId: string; canAll: boolean; partnerClientId: string | null }) {
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, deps.config.TENANT, id);
    if (cr.partner_client_id !== who.partnerClientId || (cr.author_principal_id !== who.principalId && !who.canAll)) throw notFound("Change request");
    if (!OPEN.includes(cr.state)) throw conflict("CR_STATE", `Change request is ${cr.state}`);
    await transition(q, cr, "withdrawn", who);
    return { id, state: cr.state };
  });
}

/**
 * After needs_rebase: the author confirms the items against the newest drafts (new base revisions);
 * old values are re-read from them, then the policy engine runs again.
 */
export async function resubmitCr(deps: Deps, id: string, author: Author, bases: Record<string, string>) {
  const tenant = deps.config.TENANT;
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, tenant, id);
    if (cr.author_principal_id !== author.principalId || cr.partner_client_id !== author.partnerClientId) throw notFound("Change request");
    if (cr.state !== "needs_rebase") throw conflict("CR_STATE", `Change request is ${cr.state}`);
    const items = await itemsOf(q, id);
    const input = items.map((i) => ({ entry: i.type_key, base_revision_id: bases[i.type_key] ?? "", path: i.path, op: i.op, value: i.op === "remove" ? undefined : i.new_value }));
    for (const i of input) if (!i.base_revision_id) throw badRequest("BASE_REQUIRED", `Send a new base revision for ${i.entry}`);
    // Values were already resolved/sanitised; asset objects are image values now.
    const fresh = await prepare(q, tenant, input as never, { ...author, partnerClientId: author.partnerClientId });
    for (const [k, it] of items.entries()) await q(`UPDATE change_items SET base_revision_id = $2, old_value = $3, decision = NULL, decision_reason = NULL WHERE id = $1`, [it.id, fresh[k]!.base_revision_id, JSON.stringify(fresh[k]!.old_value)]);
    await transition(q, cr, "submitted", author, { conflicts: null });
    const outcome = await decide(q, tenant, toCrItems(fresh as never), author);
    await q(`UPDATE change_requests SET decision = $2, four_eyes = $3, approvals = '[]' WHERE id = $1`, [id, JSON.stringify(outcome), outcome.fourEyes]);
    cr.four_eyes = outcome.fourEyes;
    cr.approvals = [];
    const system = { actor: { kind: "system" as const, id: "policy", display: `Policy ${outcome.policy ?? "default"}` }, request: author.request };
    if (outcome.effect === "deny") await transition(q, cr, "rejected", system, {}, "denied by policy");
    else if (outcome.effect === "auto_approve") await approveLocked(q, tenant, cr, system, { publish: outcome.autoPublish });
    else await transition(q, cr, "pending_review", system);
    return { id, state: cr.state, decision: outcome };
  });
}

/** Operator amendment: replaces an item's value before approving; the original is kept, rejected. */
export async function amendCr(deps: Deps, id: string, who: Who & { operatorId: string }, itemId: string, value: unknown) {
  const tenant = deps.config.TENANT;
  return deps.db.tx(async (q) => {
    const cr = await lockCr(q, tenant, id);
    if (cr.state !== "pending_review") throw conflict("CR_STATE", `Change request is ${cr.state}`);
    const it = (await itemsOf(q, id)).find((i) => i.id === itemId);
    if (!it || it.op !== "set") throw badRequest("UNKNOWN_ITEM", "Only set items can be amended");
    const base = await getRevision(q, it.base_revision_id);
    const clean = validateOrThrow(typeOrThrow(it.type_key), setAt(base.data, it.path, value));
    const newId = ulid("cit_");
    await q(`UPDATE change_items SET decision = 'rejected', decision_reason = 'amended by operator' WHERE id = $1`, [itemId]);
    await q(`INSERT INTO change_items (id, cr_id, entry_id, base_revision_id, path, op, old_value, new_value, added_by, position) VALUES ($1,$2,$3,$4,$5,'set',$6,$7,$8,$9)`, [newId, id, it.entry_id, it.base_revision_id, it.path, JSON.stringify(it.old_value), JSON.stringify(getAt(clean, it.path)), who.operatorId, it.position]);
    await audit(q, tenant, { action: "cr.amended", actor: who.actor, request: who.request, resource: { type: "change_request", id, item: itemId, amendment: newId }, changes: [{ op: "replace", path: `${it.type_key}${it.path}`, old: it.new_value, new: getAt(clean, it.path) }] });
    return { id, item: newId };
  });
}

/**
 * An operator published the same fields first: open CRs whose items no longer match the draft
 * move to needs_rebase (plan §7.2 "superseded").
 */
export async function recheckOpen(q: Q, tenant: string, typeKey: string, who: Who) {
  const crs = await q<CrRow>(
    `SELECT * FROM change_requests
      WHERE tenant_id = $1 AND state IN ('submitted','pending_review')
        AND id IN (SELECT ci.cr_id FROM change_items ci JOIN entries e ON e.id = ci.entry_id WHERE e.type_key = $2)
      FOR UPDATE`,
    [tenant, typeKey],
  );
  if (!crs.length) return;
  const entry = await getEntry(q, tenant, typeKey);
  const current = entry.draft_revision_id ? (await getRevision(q, entry.draft_revision_id)).data : {};
  for (const cr of crs) {
    const items = (await itemsOf(q, cr.id)).filter((i) => i.type_key === typeKey && i.decision !== "rejected");
    const { conflicts } = applyItems(current, items.map((i) => ({ id: i.id, path: i.path, op: i.op, old: i.old_value, value: i.new_value })));
    if (conflicts.length) await transition(q, cr, "needs_rebase", who, { conflicts: conflicts.map((c) => ({ ...c, path: `${typeKey}${c.path}` })) }, "superseded by an operator edit");
  }
}

/** Idle open CRs expire after 30 days. */
export async function expireIdle(q: Q, tenant: string, request: RequestInfo) {
  const crs = await q<CrRow>(`SELECT * FROM change_requests WHERE tenant_id = $1 AND state = ANY($2) AND updated_at < clock_timestamp() - interval '30 days' FOR UPDATE`, [tenant, OPEN]);
  for (const cr of crs) await transition(q, cr, "expired", { actor: { kind: "system", id: "expiry", display: "Expiry" }, request }, {}, "idle for 30 days");
  return crs.length;
}

export const isProblem = (e: unknown): e is Problem => e instanceof Problem;
export { same };
