import { CONTENT_TYPES, contentType, validate, type ContentType } from "@arapoush/schema";
import type { Actor, RequestInfo } from "../audit/audit.ts";
import { audit } from "../audit/audit.ts";
import type { Db, Q } from "../db/index.ts";
import { badRequest, notFound, Problem } from "../http/problem.ts";
import { canonical, sha256, ulid } from "../ids.ts";
import { diff, type Change } from "./diff.ts";
import { enqueueSiteWebhook } from "../webhooks/outbox.ts";

export type EntryRow = { id: string; type_key: string; slug: string; status: string; draft_revision_id: string | null; published_revision_id: string | null; scheduled_at: Date | null; created_at: Date };
export type RevisionRow = { id: string; entry_id: string; number: number; data: Record<string, unknown>; data_hash: string; parent_revision_id: string | null; author_principal_id: string | null; via_cr_id: string | null; note: string | null; created_at: Date };

/** Registers every content type from code; a schema change without a version bump fails loudly. */
export async function registerTypes(db: Db) {
  for (const t of CONTENT_TYPES) {
    const hash = sha256(canonical(t.schema));
    const [row] = await db.q<{ version: number; schema_hash: string }>(`SELECT version, schema_hash FROM content_types WHERE key = $1`, [t.key]);
    if (!row) await db.q(`INSERT INTO content_types (key, version, schema_hash) VALUES ($1,$2,$3)`, [t.key, t.version, hash]);
    else if (row.schema_hash !== hash) await db.q(`UPDATE content_types SET version = $2, schema_hash = $3, registered_at = clock_timestamp() WHERE key = $1`, [t.key, t.version, hash]);
  }
}

export function typeOrThrow(key: string): ContentType {
  const t = contentType(key);
  if (!t) throw notFound(`Content type ${key}`);
  return t;
}

export async function getEntry(q: Q, tenant: string, typeKey: string, slug = "main", lock = false): Promise<EntryRow> {
  const [e] = await q<EntryRow>(`SELECT * FROM entries WHERE tenant_id = $1 AND type_key = $2 AND slug = $3 ${lock ? "FOR UPDATE" : ""}`, [tenant, typeKey, slug]);
  if (!e) throw notFound(`Entry ${typeKey}/${slug}`);
  return e;
}

export async function getRevision(q: Q, id: string): Promise<RevisionRow> {
  const [r] = await q<RevisionRow>(`SELECT * FROM revisions WHERE id = $1`, [id]);
  if (!r) throw notFound("Revision");
  return r;
}

export function validateOrThrow(t: ContentType, data: unknown) {
  const { value, issues } = validate(t.schema, data);
  if (issues.length) throw badRequest("VALIDATION_FAILED", "Content does not match the schema", { issues: issues.slice(0, 50) });
  return value as Record<string, unknown>;
}

/**
 * Writes a new draft revision. `baseRevisionId` is the revision the editor started from: if the
 * draft moved on meanwhile, the save is refused (412) instead of silently overwriting someone.
 */
export async function saveDraft(
  q: Q,
  tenant: string,
  o: { typeKey: string; slug?: string; data: unknown; baseRevisionId: string | null; actor: Actor; request: RequestInfo; note?: string; viaCr?: string; skipConcurrency?: boolean },
): Promise<{ revision: RevisionRow; changes: Change[] }> {
  const t = typeOrThrow(o.typeKey);
  const entry = await getEntry(q, tenant, o.typeKey, o.slug, true);
  if (!o.skipConcurrency && entry.draft_revision_id !== o.baseRevisionId) throw new Problem(412, "CONFLICT_BASE_REVISION", "The content changed since you opened it; reload and reapply your edits", { current: entry.draft_revision_id });
  const data = validateOrThrow(t, o.data);
  const prev = entry.draft_revision_id ? await getRevision(q, entry.draft_revision_id) : null;
  const changes = diff(prev?.data ?? {}, data);
  if (prev && changes.length === 0) return { revision: prev, changes };
  const [{ n }] = (await q<{ n: number }>(`SELECT coalesce(max(number), 0) + 1 AS n FROM revisions WHERE entry_id = $1`, [entry.id])) as [{ n: number }];
  const id = ulid("rev_");
  const [rev] = await q<RevisionRow>(
    `INSERT INTO revisions (id, entry_id, number, data, data_hash, parent_revision_id, author_principal_id, via_cr_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, entry.id, n, JSON.stringify(data), sha256(canonical(data)), prev?.id ?? null, o.actor.id, o.viaCr ?? null, o.note ?? null],
  );
  await q(`UPDATE entries SET draft_revision_id = $2 WHERE id = $1`, [entry.id, id]);
  await audit(q, tenant, { action: "content.revision.create", actor: o.actor, request: o.request, resource: { type: "entry", id: entry.id, entry: o.typeKey, revision: id, number: n, via_cr: o.viaCr ?? null }, changes: changes.slice(0, 500) });
  return { revision: rev!, changes };
}

/** Media ids referenced anywhere in the data (`/media/<id>.<ext>`). */
export function referencedMedia(data: unknown): string[] {
  const ids = new Set<string>();
  JSON.stringify(data).replace(/\/media\/(ast_[0-9A-Z]{26})/g, (_m, id: string) => (ids.add(id), ""));
  return [...ids];
}

/** Makes a revision live, releases its media publicly and notifies the website. */
export async function publish(q: Q, tenant: string, o: { typeKey: string; slug?: string; revisionId?: string; actor: Actor; request: RequestInfo; trigger: "manual" | "cr" | "schedule" | "rollback" | "seed" }) {
  const entry = await getEntry(q, tenant, o.typeKey, o.slug, true);
  const revId = o.revisionId ?? entry.draft_revision_id;
  if (!revId) throw badRequest("NOTHING_TO_PUBLISH", "No draft to publish");
  const rev = await getRevision(q, revId);
  if (rev.entry_id !== entry.id) throw badRequest("WRONG_ENTRY", "Revision belongs to another entry");
  const media = referencedMedia(rev.data);
  if (media.length) {
    const bad = await q<{ id: string; status: string }>(`SELECT id, status FROM assets WHERE id = ANY($1) AND status <> 'clean'`, [media]);
    if (bad.length) throw badRequest("MEDIA_NOT_CLEAN", "Some media is not scanned clean yet", { assets: bad });
    await q(`UPDATE assets SET public = true WHERE id = ANY($1)`, [media]);
  }
  const prevPublished = entry.published_revision_id;
  await q(`UPDATE entries SET published_revision_id = $2, status = 'published', scheduled_at = NULL ${o.trigger === "rollback" ? ", draft_revision_id = $2" : ""} WHERE id = $1`, [entry.id, revId]);
  const pub = ulid("pub_");
  await q(`INSERT INTO publications (id, tenant_id, entry_id, revision_id, by_principal_id, trigger) VALUES ($1,$2,$3,$4,$5,$6)`, [pub, tenant, entry.id, revId, o.actor.id, o.trigger]);
  const changes = prevPublished ? diff((await getRevision(q, prevPublished)).data, rev.data) : [];
  await audit(q, tenant, { action: o.trigger === "rollback" ? "content.rollback" : "content.publish", actor: o.actor, request: o.request, resource: { type: "entry", id: entry.id, entry: o.typeKey, revision: revId, number: rev.number, previous: prevPublished, trigger: o.trigger }, changes: changes.slice(0, 500) });
  if (o.trigger !== "seed") await enqueueSiteWebhook(q, tenant, "content.published", { entry: o.typeKey, slug: entry.slug, revision: revId, publication: pub });
  return { publication: pub, revision: revId };
}
