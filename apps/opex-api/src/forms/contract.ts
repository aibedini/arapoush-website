import { z } from "zod";
import { FIELD_TYPES, FILE_KINDS, PRIORITIES } from "@arapoush/schema";
import { Iso, Ok, route } from "../openapi/contract.ts";

/** Form definitions (P11): what the builder saves and publishes. */
export const Loc = z.strictObject({ fa: z.string().max(4000).optional(), en: z.string().max(4000).optional(), tr: z.string().max(4000).optional() });
export const Field = z
  .strictObject({
    id: z.string().max(40).describe("Lowercase letters, digits and _ (starts with a letter); unique in the form."),
    type: z.enum(FIELD_TYPES),
    label: Loc,
    help: Loc.optional(),
    placeholder: Loc.optional(),
    required: z.boolean().optional(),
    width: z.enum(["full", "half"]).optional(),
    options: z.array(z.strictObject({ value: z.string().max(100), label: Loc })).max(100).optional().describe("select, radio, checkboxes"),
    min: z.number().optional().describe("text/textarea: length; number: value; checkboxes: picks"),
    max: z.number().optional().describe("text/textarea: length; number: value; checkboxes: picks; file: count"),
    pattern: z.string().max(200).optional().describe("Anchored regular expression (text)."),
    showIf: z.strictObject({ field: z.string().max(40), op: z.enum(["eq", "neq", "in", "filled", "empty"]), value: z.union([z.string().max(100), z.array(z.string().max(100)).max(50)]).optional() }).optional().describe("Show only when an earlier field matches."),
    role: z.enum(["name", "email", "phone", "company", "message"]).optional().describe("Marks the requester's identity fields (one each)."),
    accept: z.array(z.enum(FILE_KINDS)).optional(),
    defaultValue: z.string().max(300).optional().describe("hidden fields: fixed text or {page}, {utm_source}, …"),
  })
  .meta({ id: "FormField" });
export const Rule = z
  .strictObject({
    when: z.strictObject({ field: z.string().max(40), op: z.enum(["eq", "neq", "contains", "in", "gte", "lte", "filled"]), value: z.union([z.string().max(100), z.array(z.string().max(100)).max(50)]).optional() }),
    set: z.strictObject({ team: z.string().max(40).optional(), priority: z.enum(PRIORITIES).optional(), assignee: z.string().max(40).optional(), tags: z.array(z.string().max(40)).max(10).optional() }),
  })
  .meta({ id: "RoutingRule" });
export const Definition = z
  .strictObject({
    title: Loc,
    intro: Loc,
    submitLabel: Loc,
    success: Loc,
    fields: z.array(Field).max(60),
    settings: z.strictObject({
      team: z.string().max(40).nullable().describe("Team key that receives tickets (null: unrouted)."),
      priority: z.enum(PRIORITIES),
      tags: z.array(z.string().max(40)).max(10),
      rules: z.array(Rule).max(30).describe("Evaluated in order; later matches win."),
      notify: z.array(z.string().email().max(200)).max(10).describe("Addresses that get a copy of each submission."),
      confirmation: z.strictObject({ enabled: z.boolean(), subject: Loc, body: Loc }).describe("Email to the submitter; their reply threads into the ticket."),
      page: z.strictObject({ enabled: z.boolean(), indexable: z.boolean(), title: Loc, description: Loc }).describe("Standalone page /{locale}/forms/{slug}."),
      subject: z.string().max(300).describe("Ticket subject with {field_id} placeholders."),
      retentionDays: z.number().int().min(30).max(3650),
      perIpLimit: z.number().int().min(1).max(100).describe("Submissions per visitor IP per 10 minutes."),
    }),
  })
  .meta({ id: "FormDefinition" });
export const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "lowercase letters, digits and dashes");

export const MAX_FILE = 10 * 1024 * 1024;
export const Submission = z
  .strictObject({
    locale: z.enum(["fa", "en", "tr"]),
    page: z.string().regex(/^\/[\w\-/]*$/).max(200).describe("The site path the form was sent from."),
    values: z.record(z.string().max(40), z.union([z.string().max(10_000), z.array(z.string().max(300)).max(100), z.boolean(), z.number()])).describe("Field id → answer."),
    context: z.strictObject({ subject: z.string().max(300).optional(), spec: z.array(z.string().max(300)).max(30).optional() }).optional().describe("Extra context from built-in site components (the configurator's spec)."),
    files: z.array(z.strictObject({ field: z.string().max(40), name: z.string().max(200), data: z.string().max(Math.ceil((MAX_FILE * 4) / 3) + 8).describe("base64") })).max(5).optional(),
    turnstile: z.string().max(4000).optional(),
  })
  .meta({ id: "FormSubmission" });
// The P8 shape (quote sheet, contact), still accepted.
export const Legacy = z.object({ locale: z.enum(["fa", "en", "tr"]), page: z.string(), subject: z.string().max(300), spec: z.array(z.string().max(300)).max(30).default([]), fields: z.record(z.string(), z.string().max(4000)), turnstile: z.string().optional() });

const L = z.object({ fa: z.string().optional(), en: z.string().optional(), tr: z.string().optional() });
/** What the website gets for a published form (no routing, rules or notify addresses). */
export const PublicForm = z
  .object({ slug: z.string(), version: z.number(), title: L, intro: L, submitLabel: L, success: L, fields: z.array(Field), page: z.object({ enabled: z.boolean(), indexable: z.boolean(), title: L, description: L }) })
  .meta({ id: "PublicForm" });
const IdParam = z.object({ id: z.string().max(40) });
const Issues = {
  status: 400,
  code: "INVALID_SUBMISSION",
  when: "Some answers fail the form's rules; `issues` gives each field id and a code: required, invalid_email, invalid_phone, invalid_option, too_long, too_short, too_small, too_large, pattern, invalid_number, invalid_date, too_many_files, bad_file, unknown_field.",
};
const NoForm = { status: 404, code: "NOT_FOUND", when: "No such form." };

const S = "forms/routes.ts";
const tags = ["Forms"];
export const FORMS = {
  getPublic: route({
    id: "deliveryGetForm",
    method: "GET",
    path: "/v1/delivery/forms/:slug",
    audience: "delivery",
    tags: ["Delivery"],
    summary: "A published form's definition",
    description: "The website also receives every published form in the bundle (`form.<slug>`); this is for one-off reads.",
    auth: "delivery",
    source: S,
    params: z.object({ slug: z.string().max(40) }),
    responses: { 200: { description: "The published form.", schema: PublicForm } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown or unpublished form." }],
  }),
  submit: route({
    id: "deliverySubmitForm",
    method: "POST",
    path: "/v1/delivery/forms/:slug",
    audience: "delivery",
    tags: ["Delivery"],
    summary: "Submit a form (becomes a helpdesk ticket)",
    description:
      "Sent by the website's server (/api/forms/{slug}) with the visitor's IP in `X-End-User-IP`. Answers are validated against the published definition: unknown fields are refused and fields hidden by a condition are dropped. Files travel base64 in `files` (max 10 MB each, 5 in all, kinds allowed by the field, virus-scanned). Personal data is stored encrypted; the audit log never holds it. A sender blocked as spam gets 202 and nothing is stored. The P8 body shape (`subject`, `spec`, `fields`) is still accepted.",
    auth: "delivery",
    source: S,
    params: z.object({ slug: z.string().max(40) }),
    body: Submission,
    headers: [{ name: "X-End-User-IP", description: "The visitor's IP (per-IP limit, audit)." }],
    requestExample: { locale: "fa", page: "/fa/forms/sample-request", values: { name: "Sara Karimi", email: "sara@example.com", kind: "eff", qty: "20000", consent: true } },
    rateLimit: "20 per minute per visitor (the end-user IP the website asserts), plus the form's own per-visitor limit per 10 minutes",
    responses: {
      201: { description: "Stored as a ticket.", schema: z.object({ id: z.string(), number: z.number().describe("Ticket number shown to the visitor, e.g. 1042") }), example: { id: "tkt_01JD…", number: 1042 } },
      202: { description: "Accepted silently (blocked sender); nothing stored.", schema: Ok },
    },
    errors: [
      { status: 400, code: "UNKNOWN_FORM", when: "No published form with this slug." },
      Issues,
      { status: 403, code: "CHALLENGE_FAILED", when: "TURNSTILE_SECRET is set and the token is missing or invalid." },
      { status: 429, code: "TOO_MANY_INQUIRIES", when: "This visitor IP sent more than the form's limit in 10 minutes." },
      { status: 503, code: "SCANNER_UNAVAILABLE", when: "A file could not be virus-scanned; try again." },
    ],
    audit: ["ticket.created"],
  }),
  list: route({
    id: "listForms",
    method: "GET",
    path: "/v1/manage/forms",
    audience: "manage",
    tags,
    summary: "All forms",
    auth: "session",
    role: "viewer",
    source: S,
    responses: {
      200: {
        description: "Built-in forms first, then by last change.",
        schema: z.array(z.object({ id: z.string(), slug: z.string(), status: z.enum(["draft", "published", "archived"]), system: z.boolean(), version: z.number(), title: L, fields: z.number(), dirty: z.boolean().describe("The draft differs from the published version."), page: z.boolean(), open: z.number(), total: z.number(), updated_at: Iso })),
      },
    },
  }),
  create: route({
    id: "createForm",
    method: "POST",
    path: "/v1/manage/forms",
    audience: "manage",
    tags,
    summary: "Create a form (a draft with name, email and message fields)",
    auth: "session",
    role: "operator",
    source: S,
    body: z.strictObject({ slug: Slug, title: z.string().min(1).max(200) }),
    responses: { 200: { description: "Created.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 409, code: "SLUG_TAKEN", when: "A form with this address exists." }],
    audit: ["form.created"],
  }),
  get: route({
    id: "getForm",
    method: "GET",
    path: "/v1/manage/forms/:id",
    audience: "manage",
    tags,
    summary: "A form for the builder: draft, published version, issues, versions, teams",
    auth: "session",
    role: "viewer",
    source: S,
    params: IdParam,
    responses: {
      200: {
        description: "The form.",
        schema: z.object({
          form: z.object({ id: z.string(), slug: z.string(), status: z.string(), system: z.boolean(), version: z.number(), updated_at: Iso }),
          draft: Definition,
          published: Definition.nullable(),
          issues: z.array(z.object({ path: z.string(), message: z.string() })).describe("Problems that block publishing."),
          versions: z.array(z.object({ version: z.number(), published_at: Iso, by: z.string().nullable() })),
          teams: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
        }),
      },
    },
    errors: [NoForm],
  }),
  saveDraft: route({
    id: "saveFormDraft",
    method: "PUT",
    path: "/v1/manage/forms/:id/draft",
    audience: "manage",
    tags,
    summary: "Save the builder's draft",
    description: "Optimistic locking: send the `updated_at` you loaded as `version`. Issues are returned but do not block saving; they block publishing.",
    auth: "session",
    role: "operator",
    source: S,
    params: IdParam,
    body: z.strictObject({ definition: Definition, version: z.string().describe("form.updated_at as loaded") }),
    responses: { 200: { description: "Saved.", schema: z.object({ updated_at: Iso, issues: z.array(z.object({ path: z.string(), message: z.string() })) }) } },
    errors: [NoForm, { status: 409, code: "CONFLICT_BASE_REVISION", when: "Someone saved the form since you loaded it." }],
    audit: ["form.draft_saved"],
  }),
  publish: route({
    id: "publishForm",
    method: "POST",
    path: "/v1/manage/forms/:id/publish",
    audience: "manage",
    tags,
    summary: "Publish the draft (new version; the website updates within seconds)",
    auth: "session",
    role: "operator",
    source: S,
    params: IdParam,
    responses: { 200: { description: "Published.", schema: z.object({ version: z.number() }) } },
    errors: [NoForm, { status: 400, code: "FORM_INVALID", when: "The draft has issues (or an unknown team key); `issues` lists them." }],
    audit: ["form.published"],
  }),
  setStatus: route({
    id: "setFormArchived",
    method: "POST",
    path: "/v1/manage/forms/:id/status",
    audience: "manage",
    tags,
    summary: "Archive or restore a form",
    auth: "session",
    role: "operator",
    source: S,
    params: IdParam,
    body: z.strictObject({ archived: z.boolean() }),
    responses: { 200: { description: "New status.", schema: z.object({ status: z.enum(["draft", "published", "archived"]) }) } },
    errors: [NoForm, { status: 403, code: "SYSTEM_FORM", when: "Built-in forms (quote, contact) cannot be archived." }],
    audit: ["form.archived", "form.restored"],
  }),
  duplicate: route({
    id: "duplicateForm",
    method: "POST",
    path: "/v1/manage/forms/:id/duplicate",
    audience: "manage",
    tags,
    summary: "Copy a form's draft to a new form",
    auth: "session",
    role: "operator",
    source: S,
    params: IdParam,
    body: z.strictObject({ slug: Slug }),
    responses: { 200: { description: "The new form.", schema: z.object({ id: z.string() }) } },
    errors: [NoForm, { status: 409, code: "SLUG_TAKEN", when: "A form with this address exists." }],
    audit: ["form.created"],
  }),
  version: route({
    id: "getFormVersion",
    method: "GET",
    path: "/v1/manage/forms/:id/versions/:v",
    audience: "manage",
    tags,
    summary: "One published version's definition",
    auth: "session",
    role: "viewer",
    source: S,
    params: z.object({ id: z.string().max(40), v: z.string().regex(/^\d+$/) }),
    responses: { 200: { description: "The definition as published.", schema: z.object({ definition: Definition }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such version." }],
    audit: ["form.version_read"],
  }),
};
