import { z } from "zod";
import { Iso, IsoOrNull, Ok, route } from "../openapi/contract.ts";
import { GRANT_ACTIONS } from "../authz/grants.ts";
import { ConflictSchema, CrStateSchema, OutcomeSchema } from "../partner/contract.ts";

const Glob = z.string().min(1).max(120).describe("Glob: * one segment, ** any; e.g. page.* or /tech/items/**");
export const GrantBody = z
  .strictObject({
    subject_kind: z.enum(["partner_role", "partner_user", "partner_client"]),
    subject_id: z.string().min(2).max(80),
    scope: z.strictObject({ types: z.array(Glob).min(1).max(50), fields: z.array(Glob).max(100).optional(), exclude: z.array(Glob).max(100).optional(), locales: z.array(z.enum(["fa", "en", "tr"])).max(3).optional() }),
    actions: z.array(z.enum(GRANT_ACTIONS)).min(1),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .meta({ id: "GrantInput" });
export const PolicyBody = z
  .strictObject({
    name: z.string().min(2).max(160),
    priority: z.number().int().min(0).max(10000).default(100).describe("Higher wins when several policies match."),
    scope: z.strictObject({ partners: z.array(z.string().max(80)).optional(), types: z.array(Glob).optional(), fields: z.array(Glob).optional(), locales: z.array(z.enum(["fa", "en", "tr"])).optional() }),
    conditions: z
      .strictObject({
        maxItems: z.number().int().min(1).max(50).optional(),
        textEditDistanceRatio: z.strictObject({ lte: z.number().min(0).max(1) }).optional().describe("Small edits only: changed share of the text."),
        maxLengthDelta: z.number().int().min(0).optional(),
        noNewAssets: z.boolean().optional(),
        assetsOnly: z.boolean().optional(),
        noLinks: z.boolean().optional(),
        locales: z.array(z.enum(["fa", "en", "tr"])).optional(),
        principalRoles: z.array(z.string().max(40)).optional(),
        principals: z.array(z.string().max(40)).optional(),
        timeWindow: z.strictObject({ tz: z.string().max(60), days: z.array(z.enum(["sat", "sun", "mon", "tue", "wed", "thu", "fri"])).optional(), from: z.string().regex(/^\d\d:\d\d$/).optional(), to: z.string().regex(/^\d\d:\d\d$/).optional() }).optional(),
        entryCreate: z.boolean().optional(),
        entryDelete: z.boolean().optional(),
        requiresSecondApprover: z.boolean().optional(),
        cooldown: z.strictObject({ maxPerHour: z.number().int().min(1).max(1000) }).optional(),
      })
      .default({}),
    effect: z.enum(["auto_approve", "require_review", "deny"]),
    auto_publish: z.boolean().default(false),
    enabled: z.boolean().default(true),
  })
  .meta({ id: "PolicyInput" });
export const SimItem = z.strictObject({ type: z.string().max(80), path: z.string().max(300), op: z.enum(["set", "insert", "remove"]).default("set"), old: z.unknown().optional(), value: z.unknown().optional(), newAssets: z.array(z.string()).optional() });
export const Decisions = z.record(z.string().max(40), z.strictObject({ decision: z.enum(["approved", "rejected"]), reason: z.string().max(500).optional() })).describe("Item id → decision; items not listed are approved.");

const IdParam = z.object({ id: z.string().max(40) });
const NoCr = { status: 404, code: "NOT_FOUND", when: "No such change request." };
const State = { status: 409, code: "CR_STATE", when: "Not in a state that allows this." };
const GlobalStepUp = { status: 403, code: "STEP_UP_REQUIRED", when: "Publishing global.* content needs a fresh authenticator confirmation." };
const CrMove = z.object({ id: z.string(), state: CrStateSchema, conflicts: z.array(ConflictSchema).optional() });
const Item = z.object({ id: z.string(), cr_id: z.string(), entry_id: z.string(), type_key: z.string(), base_revision_id: z.string(), path: z.string(), op: z.enum(["set", "insert", "remove"]), old_value: z.unknown(), new_value: z.unknown(), decision: z.enum(["approved", "rejected"]).nullable(), decision_reason: z.string().nullable(), added_by: z.string().nullable(), position: z.number() });
const Row = z.record(z.string(), z.unknown());

const S = "cr/manage.ts";
const tags = ["Change requests"];
const read = { audience: "manage" as const, auth: "session" as const, role: "viewer" as const, source: S };
const write = { ...read, role: "operator" as const };
const admin = { ...read, role: "super_admin" as const, stepUp: true };
export const CR = {
  list: route({
    ...read,
    tags,
    id: "listChangeRequests",
    method: "GET",
    path: "/v1/manage/change-requests",
    summary: "Review queue (newest 300)",
    query: z.object({ state: z.string().max(20).optional() }),
    responses: {
      200: {
        description: "Change requests.",
        schema: z.array(z.object({ id: z.string(), title: z.string(), state: CrStateSchema, created_at: Iso, updated_at: Iso, four_eyes: z.boolean(), approvals: z.number(), effect: z.string().nullable(), author: z.string().nullable(), partner: z.string().nullable(), items: z.number(), entries: z.array(z.string()).nullable() })),
      },
    },
  }),
  get: route({
    ...read,
    tags,
    id: "getChangeRequest",
    method: "GET",
    path: "/v1/manage/change-requests/:id",
    summary: "A change request with each item's current draft value",
    description: "`stale` is true when the draft no longer has the value the author started from.",
    params: IdParam,
    responses: {
      200: {
        description: "The change request (all columns) plus items.",
        schema: z
          .object({
            id: z.string(),
            title: z.string(),
            note: z.string().nullable(),
            state: CrStateSchema,
            decision: OutcomeSchema.nullable(),
            conflicts: z.array(ConflictSchema).nullable(),
            four_eyes: z.boolean(),
            approvals: z.array(z.object({ by: z.string(), at: z.string() })),
            author: z.string().nullable(),
            author_role: z.string().nullable(),
            partner: z.string().nullable(),
            created_at: Iso,
            updated_at: Iso,
            items: z.array(Item.extend({ current: z.unknown(), stale: z.boolean() })),
          })
          .loose(),
      },
    },
    errors: [NoCr],
  }),
  approve: route({
    ...write,
    tags,
    id: "approveChangeRequest",
    method: "POST",
    path: "/v1/manage/change-requests/:id/approve",
    summary: "Approve (optionally per item, optionally publish)",
    description: "With four-eyes the first approval is recorded and a second, different operator completes it. If the draft changed under the items, the request moves to needs_rebase with `conflicts`.",
    params: IdParam,
    body: z.strictObject({ publish: z.boolean().default(false), decisions: Decisions.optional() }).optional(),
    responses: { 200: { description: "New state.", schema: CrMove } },
    errors: [NoCr, State, GlobalStepUp, { status: 400, code: "UNKNOWN_ITEM", when: "A decision names an item not in this request." }],
    audit: ["cr.approval_recorded", "cr.approved", "cr.published", "cr.rejected", "cr.needs_rebase"],
  }),
  reject: route({
    ...write,
    tags,
    id: "rejectChangeRequest",
    method: "POST",
    path: "/v1/manage/change-requests/:id/reject",
    summary: "Reject with a reason (sent to the partner)",
    params: IdParam,
    body: z.strictObject({ reason: z.string().min(3).max(500) }),
    responses: { 200: { description: "Rejected.", schema: CrMove } },
    errors: [NoCr, State],
    audit: ["cr.rejected"],
  }),
  amend: route({
    ...write,
    tags,
    id: "amendChangeRequest",
    method: "POST",
    path: "/v1/manage/change-requests/:id/amend",
    summary: "Change one item's value before approving (recorded as an operator item)",
    params: IdParam,
    body: z.strictObject({ item: z.string().max(40), value: z.unknown() }),
    responses: { 200: { description: "The replacement item.", schema: z.object({ id: z.string(), item: z.string() }) } },
    errors: [NoCr, { status: 409, code: "CR_STATE", when: "Not pending review." }, { status: 400, code: "UNKNOWN_ITEM", when: "No such set item." }],
    audit: ["cr.amended"],
  }),
  publish: route({
    ...write,
    tags,
    id: "publishChangeRequest",
    method: "POST",
    path: "/v1/manage/change-requests/:id/publish",
    summary: "Publish an approved change request",
    params: IdParam,
    responses: { 200: { description: "Published.", schema: CrMove } },
    errors: [NoCr, { status: 409, code: "CR_STATE", when: "Not approved." }, GlobalStepUp],
    audit: ["cr.published", "content.publish"],
  }),
  grants: route({ ...write, tags: ["Access"], id: "listGrants", method: "GET", path: "/v1/manage/grants", summary: "Partner grants", responses: { 200: { description: "All grants (table rows).", schema: z.array(Row) } } }),
  createGrant: route({ ...admin, tags: ["Access"], id: "createGrant", method: "POST", path: "/v1/manage/grants", summary: "Grant a partner role, user or client access", body: GrantBody, responses: { 200: { description: "Created.", schema: z.object({ id: z.string() }) } }, audit: ["grant.create"] }),
  deleteGrant: route({ ...admin, tags: ["Access"], id: "deleteGrant", method: "DELETE", path: "/v1/manage/grants/:id", summary: "Remove a grant", params: IdParam, responses: { 200: { description: "Removed.", schema: Ok } }, errors: [{ status: 404, code: "NOT_FOUND", when: "No such grant." }], audit: ["grant.delete"] }),
  policies: route({ ...read, tags: ["Approval policies"], id: "listPolicies", method: "GET", path: "/v1/manage/policies", summary: "Approval policies (highest priority first)", responses: { 200: { description: "All policies (table rows).", schema: z.array(Row) } } }),
  simulate: route({
    ...read,
    tags: ["Approval policies"],
    id: "simulatePolicies",
    method: "POST",
    path: "/v1/manage/policies/simulate",
    summary: "What would the policies decide for these items? (optionally with a draft policy)",
    body: z.strictObject({ items: z.array(SimItem).min(1).max(200), policy: PolicyBody.optional(), partner: z.string().max(80).default(""), role: z.string().max(40).nullable().default(null), principal: z.string().max(40).default("simulated"), at: z.string().datetime().optional() }),
    responses: { 200: { description: "The decision.", schema: OutcomeSchema } },
  }),
  createPolicy: route({
    ...admin,
    tags: ["Approval policies"],
    id: "createPolicy",
    method: "POST",
    path: "/v1/manage/policies",
    summary: "Create a policy",
    body: PolicyBody,
    responses: { 200: { description: "Created.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 400, code: "POLICY_TOO_BROAD", when: "Auto-approve policies must name the content types they cover." }],
    audit: ["policy.create"],
  }),
  updatePolicy: route({
    ...admin,
    tags: ["Approval policies"],
    id: "updatePolicy",
    method: "PUT",
    path: "/v1/manage/policies/:id",
    summary: "Replace a policy",
    params: IdParam,
    body: PolicyBody,
    responses: { 200: { description: "Saved.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such policy." }, { status: 400, code: "POLICY_TOO_BROAD", when: "Auto-approve policies must name the content types they cover." }],
    audit: ["policy.update"],
  }),
  deletePolicy: route({ ...admin, tags: ["Approval policies"], id: "deletePolicy", method: "DELETE", path: "/v1/manage/policies/:id", summary: "Delete a policy", params: IdParam, responses: { 200: { description: "Deleted.", schema: Ok } }, errors: [{ status: 404, code: "NOT_FOUND", when: "No such policy." }], audit: ["policy.delete"] }),
  setWebhook: route({
    ...admin,
    tags: ["Partners"],
    id: "setPartnerWebhook",
    method: "PUT",
    path: "/v1/manage/partners/:id/webhook",
    summary: "Set (or clear) a partner's webhook URL; a new secret is returned once",
    params: IdParam,
    body: z.strictObject({ url: z.string().url().nullable().describe("https only in production; null turns webhooks off.") }),
    responses: { 200: { description: "Show `secret` to the partner now; it is not shown again.", schema: z.object({ url: z.string().nullable(), secret: z.string().nullable() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such partner." }],
    audit: ["partner.webhook_set"],
  }),
  webhooks: route({
    ...write,
    tags: ["Webhooks"],
    id: "listWebhookDeliveries",
    method: "GET",
    path: "/v1/manage/webhooks",
    summary: "Webhook deliveries (newest 200)",
    responses: {
      200: { description: "Deliveries.", schema: z.array(z.object({ id: z.string(), target: z.string(), event: z.string(), status: z.enum(["pending", "delivered", "dead", "failed"]), attempt: z.number(), last_code: z.number().nullable(), last_error: z.string().nullable(), next_attempt_at: IsoOrNull, created_at: Iso })) },
    },
  }),
  retryWebhook: route({
    ...write,
    tags: ["Webhooks"],
    id: "retryWebhookDelivery",
    method: "POST",
    path: "/v1/manage/webhooks/:id/retry",
    summary: "Send a failed or pending delivery again now",
    params: IdParam,
    responses: { 200: { description: "Queued.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such delivery, or it was already delivered." }],
    audit: ["webhook.retry"],
  }),
};
