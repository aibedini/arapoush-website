import { z } from "zod";
import { Iso, IsoOrNull, Locale, route } from "../openapi/contract.ts";

/** Change request shapes shared by the partner and management contracts. */
export const CrStateSchema = z.enum(["submitted", "pending_review", "approved", "published", "rejected", "withdrawn", "needs_rebase", "expired"]).meta({ id: "CrState" });
export const OutcomeSchema = z
  .object({
    effect: z.enum(["auto_approve", "require_review", "deny"]),
    autoPublish: z.boolean(),
    fourEyes: z.boolean().describe("Two different operators must approve."),
    policy: z.string().nullable().describe("The policy that decided (null: the default)."),
    reasons: z.array(z.string()),
  })
  .meta({ id: "PolicyDecision" });
export const ConflictSchema = z.object({ item: z.string(), path: z.string(), expected: z.unknown(), current: z.unknown() }).meta({ id: "Conflict" });
export const ItemInputSchema = z
  .strictObject({
    entry: z.string().max(80).describe("Content type key, e.g. page.printing"),
    base_revision_id: z.string().max(40).describe("The draft revision you read (GET /v1/partner/content/{type} → base_revision_id)."),
    path: z.string().startsWith("/").max(300).describe("Field path; list items by key [id=…] or index [n], e.g. /tech/items[id=flexo]/summary"),
    locale: Locale.optional().describe("For localized text: the one language this item changes."),
    op: z.enum(["set", "insert", "remove"]).default("set").describe("insert appends to the list at path (grant entry.create); remove deletes the item (grant entry.delete)."),
    value: z.unknown().optional().describe("New value. Images: { asset: 'ast_…', alt?: {fa,en,tr} } with an id from POST /v1/partner/media."),
  })
  .meta({ id: "ChangeItemInput" });
export const CrInputSchema = z
  .strictObject({ title: z.string().min(2).max(200), note: z.string().max(2000).optional(), items: z.array(ItemInputSchema).min(1).max(200) })
  .meta({ id: "ChangeRequestInput" });
const CrResult = z.object({ id: z.string(), state: CrStateSchema, decision: OutcomeSchema.optional(), conflicts: z.array(ConflictSchema).optional() });

const Type = z.object({ type: z.string().max(80).describe("Content type key, e.g. page.printing") });
const IdParam = z.object({ id: z.string().max(40) });
const SchemaField = z.record(z.string(), z.unknown()).describe("Field definition (kind, localized, max, required, locked, operatorOnly, fields/of…), see @arapoush/schema fields.ts");
const AssetStatus = z.object({ asset: z.string(), status: z.string().describe("clean | rejected | pending"), mime: z.string(), width: z.number().nullable(), height: z.number().nullable(), bytes: z.number() });

const S = "partner/routes.ts";
const tags = ["Partner"];
export const PARTNER = {
  me: route({
    id: "partnerMe",
    method: "GET",
    path: "/v1/partner/me",
    audience: "partner",
    tags,
    summary: "Who am I: principal, scopes and grants",
    auth: "partner",
    source: S,
    responses: {
      200: {
        description: "The calling AraCMS user and what they may do.",
        schema: z.object({
          id: z.string(),
          kind: z.string(),
          display: z.string(),
          role: z.string().nullable(),
          client: z.string().nullable(),
          scopes: z.array(z.string()),
          grants: z.array(z.object({ id: z.string(), subject: z.string(), scope: z.record(z.string(), z.unknown()), actions: z.array(z.string()), expires_at: IsoOrNull })),
        }),
        example: { id: "prn_01JD…", kind: "partner_user", display: "AraCMS: Sara", role: "editor", client: "aracms", scopes: ["content:read", "content:propose"], grants: [{ id: "grt_01JD…", subject: "partner_role:editor", scope: { types: ["page.printing"] }, actions: ["read", "propose"], expires_at: null }] },
      },
    },
  }),
  schema: route({
    id: "partnerSchema",
    method: "GET",
    path: "/v1/partner/schema",
    audience: "partner",
    tags,
    summary: "Content types and fields you may read and propose",
    description: "AraCMS builds its edit forms from this: `schema` is what the caller may read, `proposable` what it may change (both projected to the caller's grants). Locked and operator-only fields are never proposable.",
    auth: "partner",
    source: S,
    responses: { 200: { description: "One item per readable type.", schema: z.array(z.object({ key: z.string(), label: z.string(), version: z.number(), schema: SchemaField, proposable: SchemaField.nullable() })) } },
  }),
  content: route({
    id: "partnerGetContent",
    method: "GET",
    path: "/v1/partner/content/:type",
    audience: "partner",
    tags,
    summary: "Current draft of a type, projected to your grants",
    auth: "partner",
    source: S,
    params: Type,
    responses: {
      200: {
        description: "The draft (fields you may not read are removed). Use `base_revision_id` in change request items.",
        headers: { ETag: "The draft revision id." },
        schema: z.object({ type: z.string(), base_revision_id: z.string().nullable(), number: z.number(), updated_at: IsoOrNull, published_revision_id: z.string().nullable(), data: z.record(z.string(), z.unknown()) }),
      },
    },
    errors: [
      { status: 403, code: "GRANT_DENIED", when: "No read grant on this type." },
      { status: 404, code: "NOT_FOUND", when: "Unknown content type." },
    ],
  }),
  history: route({
    id: "partnerContentHistory",
    method: "GET",
    path: "/v1/partner/content/:type/history",
    audience: "partner",
    tags,
    summary: "Revisions of a type (or one revision's projected data)",
    auth: "partner",
    source: S,
    params: Type,
    query: z.object({ revision: z.string().max(40).optional().describe("Return this revision's data instead of the list.") }),
    responses: {
      200: {
        description: "Without `revision`: the newest 100 revisions. With it: that revision's projected data.",
        schema: z.union([
          z.array(z.object({ id: z.string(), number: z.number(), created_at: Iso, via_cr_id: z.string().nullable(), author_kind: z.string().nullable(), is_draft: z.boolean(), is_published: z.boolean() })),
          z.object({ id: z.string(), number: z.number(), created_at: Iso, data: z.record(z.string(), z.unknown()) }),
        ]),
      },
    },
    errors: [
      { status: 403, code: "GRANT_DENIED", when: "No read grant on this type." },
      { status: 404, code: "NOT_FOUND", when: "Unknown type, or the revision belongs to another entry." },
    ],
  }),
  upload: route({
    id: "partnerUploadMedia",
    method: "POST",
    path: "/v1/partner/media",
    audience: "partner",
    tags,
    summary: "Upload a file (raw bytes)",
    description: "Raster images are re-encoded to WebP (metadata stripped); SVG and PDF are checked for active content; everything is virus-scanned. Use the returned `asset` id in a change request value. Max 25 MB.",
    auth: "partner",
    signed: true,
    source: S,
    body: z.string().describe("The file bytes").meta({ format: "binary" }),
    bodyType: "application/octet-stream",
    headers: [{ name: "X-Filename", description: "Original file name (sanitized; `.ai` files must be PDF-compatible)." }],
    rateLimit: "120 uploads per hour per IP",
    responses: { 200: { description: "Stored (or an identical file already existed).", schema: AssetStatus } },
    errors: [
      { status: 403, code: "GRANT_DENIED", when: "No media.upload grant." },
      { status: 400, code: "NO_FILE", when: "Body is not application/octet-stream." },
      { status: 400, code: "MEDIA_REJECTED", when: "Type not allowed, active content, unreadable file or malware (`detail` says which)." },
    ],
    audit: ["media.upload", "media.rejected"],
  }),
  media: route({
    id: "partnerGetMedia",
    method: "GET",
    path: "/v1/partner/media/:id",
    audience: "partner",
    tags,
    summary: "Status of one of your uploads",
    auth: "partner",
    source: S,
    params: IdParam,
    responses: { 200: { description: "The asset.", schema: AssetStatus.extend({ scan: z.string().nullable(), public: z.boolean(), created_at: Iso }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such asset uploaded by your partner client." }],
  }),
  createCr: route({
    id: "partnerCreateChangeRequest",
    method: "POST",
    path: "/v1/partner/change-requests",
    audience: "partner",
    tags,
    summary: "Propose changes (the policy engine decides at once)",
    description:
      "Every item is checked against your grants and the schema. The policy engine then auto-approves (and may publish), sends to review, or denies. Watch `cr.state_changed` webhooks or poll GET /v1/partner/change-requests/{id}.",
    auth: "partner",
    signed: true,
    source: S,
    body: CrInputSchema,
    requestExample: { title: "Fix flexo summary", items: [{ entry: "page.printing", base_revision_id: "rev_01JD…", path: "/tech/items[id=flexo]/summary", locale: "en", value: "Fast, economical flexographic printing." }] },
    rateLimit: "300 per hour per IP",
    responses: { 201: { description: "Created and decided.", schema: CrResult, example: { id: "cr_01JD…", state: "pending_review", decision: { effect: "require_review", autoPublish: false, fourEyes: false, policy: null, reasons: ["default: review"] } } } },
    errors: [
      { status: 403, code: "GRANT_DENIED", when: "An item touches a field, locale or action you have no grant for." },
      { status: 403, code: "FIELD_LOCKED", when: "An item touches a locked or operator-only field." },
      { status: 400, code: "PATH_NOT_FOUND", when: "An item path does not exist in the draft." },
      { status: 400, code: "UNKNOWN_ASSET", when: "A value names an asset that is not yours and not public." },
      { status: 400, code: "BAD_BASE_REVISION", when: "A base_revision_id does not belong to the item's entry." },
      { status: 400, code: "VALUE_REQUIRED", when: "A set or insert item has no value." },
      { status: 404, code: "NOT_FOUND", when: "Unknown content type in an item." },
    ],
    audit: ["cr.submitted", "cr.policy_decision", "cr.approved", "cr.published", "cr.rejected"],
  }),
  listCr: route({
    id: "partnerListChangeRequests",
    method: "GET",
    path: "/v1/partner/change-requests",
    audience: "partner",
    tags,
    summary: "Your change requests (your partner's, with cr.read_all)",
    auth: "partner",
    source: S,
    query: z.object({ state: z.string().max(20).optional().describe("Filter by state (see CrState).") }),
    responses: { 200: { description: "Newest 200.", schema: z.array(z.object({ id: z.string(), title: z.string(), state: CrStateSchema, created_at: Iso, updated_at: Iso, effect: z.string().nullable() })) } },
  }),
  getCr: route({
    id: "partnerGetChangeRequest",
    method: "GET",
    path: "/v1/partner/change-requests/:id",
    audience: "partner",
    tags,
    summary: "One change request with per-item decisions",
    auth: "partner",
    source: S,
    params: IdParam,
    responses: {
      200: {
        description: "The change request.",
        schema: z.object({
          id: z.string(),
          title: z.string(),
          note: z.string().nullable(),
          state: CrStateSchema,
          decision: OutcomeSchema.nullable(),
          conflicts: z.array(ConflictSchema).nullable(),
          created_at: Iso,
          updated_at: Iso,
          decided_at: IsoOrNull,
          published_at: IsoOrNull,
          decision_reason: z.string().nullable(),
          mine: z.boolean(),
          items: z.array(z.object({ id: z.string(), entry: z.string(), path: z.string(), op: z.enum(["set", "insert", "remove"]), old: z.unknown(), value: z.unknown(), base_revision_id: z.string(), decision: z.enum(["approved", "rejected"]).nullable(), reason: z.string().nullable(), by_operator: z.boolean() })),
        }),
      },
    },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Not yours (or not your partner's with cr.read_all)." }],
  }),
  withdraw: route({
    id: "partnerWithdrawChangeRequest",
    method: "POST",
    path: "/v1/partner/change-requests/:id/withdraw",
    audience: "partner",
    tags,
    summary: "Withdraw an open change request",
    auth: "partner",
    signed: true,
    source: S,
    params: IdParam,
    responses: { 200: { description: "Withdrawn.", schema: z.object({ id: z.string(), state: CrStateSchema }) } },
    errors: [
      { status: 403, code: "GRANT_DENIED", when: "No cr.withdraw grant." },
      { status: 404, code: "NOT_FOUND", when: "Not yours." },
      { status: 409, code: "CR_STATE", when: "Already decided, published or withdrawn." },
    ],
    audit: ["cr.withdrawn"],
  }),
  resubmit: route({
    id: "partnerResubmitChangeRequest",
    method: "POST",
    path: "/v1/partner/change-requests/:id/resubmit",
    audience: "partner",
    tags,
    summary: "After needs_rebase: confirm items against the newest revisions",
    auth: "partner",
    signed: true,
    source: S,
    params: IdParam,
    body: z.strictObject({ base_revision_ids: z.record(z.string().max(80), z.string().max(40)).describe("Content type key → the draft revision id you checked against.") }),
    responses: { 200: { description: "Re-decided by the policy engine.", schema: z.object({ id: z.string(), state: CrStateSchema, decision: OutcomeSchema }) } },
    errors: [
      { status: 404, code: "NOT_FOUND", when: "Not yours." },
      { status: 409, code: "CR_STATE", when: "Not in needs_rebase." },
      { status: 400, code: "BASE_REQUIRED", when: "No new base revision for one of the entries." },
    ],
    audit: ["cr.submitted", "cr.policy_decision"],
  }),
  preview: route({
    id: "partnerCreatePreview",
    method: "POST",
    path: "/v1/partner/previews",
    audience: "partner",
    tags,
    summary: "A 30-minute website link with your change request applied",
    auth: "partner",
    signed: true,
    source: S,
    body: z.strictObject({ cr: z.string().max(40), locale: Locale.default("fa") }),
    responses: { 200: { description: "Open `url` in a browser; it works for 30 minutes.", schema: z.object({ url: z.string(), expiresIn: z.number().describe("Seconds") }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Not your change request." }],
    audit: ["content.preview"],
  }),
};

