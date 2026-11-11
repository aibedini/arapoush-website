import { z } from "zod";
import { Iso, IsoOrNull, Ok, route } from "../openapi/contract.ts";

export const SaveDraftBody = z.strictObject({
  data: z.record(z.string(), z.unknown()).describe("The whole entry, validated against the type's schema."),
  base_revision_id: z.string().nullable().describe("The draft revision you loaded (null for an entry without a draft)."),
  note: z.string().max(500).optional(),
});
export const PatchDraftBody = z.strictObject({
  base_revision_id: z.string().nullable(),
  ops: z.array(z.object({ path: z.string().startsWith("/").max(300).describe("Field path, e.g. /hero/slides[1]/title[0]@fa"), value: z.unknown() })).min(1).max(200),
  note: z.string().max(500).optional(),
});
const ChangeSchema = z.object({ op: z.enum(["add", "remove", "replace"]), path: z.string(), old: z.unknown().optional(), new: z.unknown().optional() }).meta({ id: "Change" });
const EntrySchema = z.object({ id: z.string(), type_key: z.string(), slug: z.string(), status: z.string(), draft_revision_id: z.string().nullable(), published_revision_id: z.string().nullable(), scheduled_at: IsoOrNull, created_at: Iso });
const Revision = z
  .object({ id: z.string(), entry_id: z.string(), number: z.number(), data: z.record(z.string(), z.unknown()), data_hash: z.string(), parent_revision_id: z.string().nullable(), author_principal_id: z.string().nullable(), via_cr_id: z.string().nullable(), note: z.string().nullable(), created_at: Iso })
  .meta({ id: "Revision" });
const Field = z.record(z.string(), z.unknown()).describe("Field definition (packages/schema/src/fields.ts)");
const Type = z.object({ type: z.string().max(80) });
const Saved = z.object({ revision: z.object({ id: z.string(), number: z.number() }) });
const Published = z.object({ publication: z.string(), revision: z.string() });
const Concurrency = { status: 412, code: "CONFLICT_BASE_REVISION", when: "The draft changed since you loaded it (`current` is the new revision id); reload and reapply." };
const Locked = [
  { status: 403, code: "FIELD_LOCKED", when: "A locked field changed and you are not a super admin (`paths` lists them)." },
  { status: 403, code: "STEP_UP_REQUIRED", when: "A super admin changed a locked field without a fresh authenticator confirmation." },
];
const Invalid = { status: 400, code: "VALIDATION_FAILED", when: "The content does not match the schema (`issues`, up to 50)." };
const NoEntry = { status: 404, code: "NOT_FOUND", when: "Unknown content type or entry." };

const S = "content/routes.ts";
const tags = ["Content"];
const read = { auth: "session" as const, role: "viewer" as const, audience: "manage" as const, tags, source: S };
const write = { ...read, role: "operator" as const };
export const CONTENT = {
  types: route({ ...read, id: "listTypes", method: "GET", path: "/v1/manage/types", summary: "Content types", responses: { 200: { description: "Every type.", schema: z.array(z.object({ key: z.string(), label: z.string(), singleton: z.boolean(), version: z.number() })) } } }),
  type: route({
    ...read,
    id: "getType",
    method: "GET",
    path: "/v1/manage/types/:key",
    summary: "One type with its full schema",
    params: z.object({ key: z.string().max(80) }),
    responses: { 200: { description: "The type.", schema: z.object({ key: z.string(), label: z.string(), singleton: z.boolean(), version: z.number(), schema: Field }) } },
    errors: [NoEntry],
  }),
  entries: route({
    ...read,
    id: "listEntries",
    method: "GET",
    path: "/v1/manage/entries",
    summary: "Every entry with draft and publish state",
    responses: {
      200: {
        description: "By type key.",
        schema: z.array(
          EntrySchema.omit({ created_at: true }).extend({ draft_number: z.number().nullable(), draft_at: IsoOrNull, published_number: z.number().nullable(), published_at: IsoOrNull, unpublished_changes: z.boolean(), open_crs: z.number() }),
        ),
      },
    },
  }),
  entry: route({
    ...read,
    id: "getEntry",
    method: "GET",
    path: "/v1/manage/entries/:type",
    summary: "An entry for editing: draft, schema and what changed since publishing",
    params: Type,
    responses: {
      200: {
        description: "The entry.",
        headers: { ETag: "The draft revision id." },
        schema: z.object({ entry: EntrySchema, schema: Field, draft: Revision.nullable(), publishedData: z.record(z.string(), z.unknown()).nullable(), changesSincePublish: z.array(ChangeSchema) }),
      },
    },
    errors: [NoEntry],
  }),
  save: route({
    ...write,
    id: "saveDraft",
    method: "PUT",
    path: "/v1/manage/entries/:type",
    summary: "Save a whole draft",
    description: "Creates a new draft revision. Open change requests touching changed fields move to needs_rebase. On the effervescent page, changed sizes or caps queue a 3D render.",
    params: Type,
    body: SaveDraftBody,
    responses: { 200: { description: "Saved.", schema: Saved.extend({ changes: z.number() }) } },
    errors: [NoEntry, Invalid, Concurrency, ...Locked],
    audit: ["content.revision.create", "cr.needs_rebase", "render.queued"],
  }),
  patch: route({
    ...write,
    id: "patchDraft",
    method: "PATCH",
    path: "/v1/manage/entries/:type",
    summary: "Change single fields (path + value)",
    description: "Used by the visual editor for in-place text edits. Same concurrency and lock rules as saving the whole draft.",
    params: Type,
    body: PatchDraftBody,
    requestExample: { base_revision_id: "rev_01JD…", ops: [{ path: "/hero/slides[0]/title[0]@fa", value: "بسته‌بندی،" }] },
    responses: { 200: { description: "Saved.", schema: Saved.extend({ changes: z.array(ChangeSchema) }) } },
    errors: [NoEntry, Invalid, Concurrency, ...Locked, { status: 400, code: "PATH_NOT_FOUND", when: "A path does not exist in the draft." }],
    audit: ["content.revision.create", "cr.needs_rebase", "render.queued"],
  }),
  publish: route({
    ...write,
    id: "publishEntry",
    method: "POST",
    path: "/v1/manage/entries/:type/publish",
    summary: "Publish the draft (or a given revision)",
    description: "The website refreshes within seconds (content.published webhook). Publishing `global.*` (header, footer, contact) also needs a fresh step-up.",
    params: Type,
    body: z.strictObject({ revision_id: z.string().optional() }).optional(),
    responses: { 200: { description: "Published.", schema: Published } },
    errors: [
      NoEntry,
      { status: 403, code: "STEP_UP_REQUIRED", when: "global.* entries need a fresh authenticator confirmation." },
      { status: 400, code: "NOTHING_TO_PUBLISH", when: "No draft." },
      { status: 400, code: "WRONG_ENTRY", when: "The revision belongs to another entry." },
      { status: 400, code: "MEDIA_NOT_CLEAN", when: "Some media is not scanned clean yet (`assets`)." },
    ],
    audit: ["content.publish"],
  }),
  rollback: route({
    ...write,
    id: "rollbackEntry",
    method: "POST",
    path: "/v1/manage/entries/:type/rollback",
    summary: "Publish an earlier revision again",
    stepUp: true,
    params: Type,
    body: z.strictObject({ revision_id: z.string() }),
    responses: { 200: { description: "Published.", schema: Published } },
    errors: [NoEntry, { status: 400, code: "WRONG_ENTRY", when: "The revision belongs to another entry." }, { status: 400, code: "MEDIA_NOT_CLEAN", when: "Some media is not scanned clean yet." }],
    audit: ["content.rollback"],
  }),
  schedule: route({
    ...write,
    id: "scheduleEntry",
    method: "POST",
    path: "/v1/manage/entries/:type/schedule",
    summary: "Publish the draft at a time (null cancels)",
    params: Type,
    body: z.strictObject({ at: z.string().datetime().nullable() }),
    responses: { 200: { description: "Scheduled or cancelled.", schema: Ok } },
    errors: [NoEntry, { status: 400, code: "SCHEDULE_IN_PAST", when: "Less than one minute ahead." }],
    audit: ["content.schedule", "content.unschedule"],
  }),
  revisions: route({
    ...read,
    id: "listRevisions",
    method: "GET",
    path: "/v1/manage/entries/:type/revisions",
    summary: "Revision history (newest 200)",
    params: Type,
    responses: {
      200: {
        description: "Newest first.",
        schema: z.array(z.object({ id: z.string(), number: z.number(), created_at: Iso, note: z.string().nullable(), via_cr_id: z.string().nullable(), author_principal_id: z.string().nullable(), author: z.string().nullable(), author_kind: z.string().nullable(), is_draft: z.boolean(), is_published: z.boolean() })),
      },
    },
    errors: [NoEntry],
  }),
  revision: route({ ...read, id: "getRevision", method: "GET", path: "/v1/manage/revisions/:id", summary: "One revision with its data", params: z.object({ id: z.string().max(40) }), responses: { 200: { description: "The revision.", schema: Revision } }, errors: [{ status: 404, code: "NOT_FOUND", when: "No such revision." }] }),
  diff: route({
    ...read,
    id: "diffRevisions",
    method: "GET",
    path: "/v1/manage/diff",
    summary: "Field-level differences between two revisions of one entry",
    query: z.object({ from: z.string(), to: z.string() }),
    responses: { 200: { description: "Changes from `from` to `to`.", schema: z.array(ChangeSchema) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown revision, or the two belong to different entries." }],
  }),
};
