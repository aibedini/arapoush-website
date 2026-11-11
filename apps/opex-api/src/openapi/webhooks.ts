import { z } from "zod";
import { Iso } from "./contract.ts";
import type { Audience } from "./contract.ts";

/**
 * Webhooks OPEX sends (src/webhooks/outbox.ts). Delivery is at least once, retried with backoff
 * (1 min … 6 h, 24 attempts), POST application/json, signed:
 *   OPEX-Signature: t=<unix seconds>, v1=<hex HMAC-SHA256(secret, t + "." + raw body)>
 * Receivers must check the signature on the raw body, reject `t` older than 5 minutes, and ignore an
 * `id` they have already processed. Any 2xx acknowledges; anything else is retried.
 */
const envelope = <T extends z.ZodType>(event: string, data: T) =>
  z.object({ id: z.string().describe("Event id (evt_…); unique, use it to drop duplicates."), event: z.literal(event), data, created: Iso });

const ContentPublished = envelope(
  "content.published",
  z.union([
    z.object({ entry: z.string().describe("Content type key, e.g. page.printing"), slug: z.string(), revision: z.string(), publication: z.string() }).describe("One entry was published."),
    z.object({ types: z.array(z.string()).describe("Changed keys, e.g. form.sample-request") }).describe("A form was published, archived or restored."),
    z.object({ all: z.literal(true), reason: z.string() }).describe("Refresh everything (CLI site:revalidate after a deploy or restore)."),
  ]),
);
const CrStateChanged = envelope(
  "cr.state_changed",
  z.object({
    cr: z.string().describe("Change request id (cr_…)"),
    state: z.enum(["submitted", "pending_review", "approved", "published", "rejected", "withdrawn", "needs_rebase", "expired"]),
    conflicts: z.array(z.object({ item: z.string(), path: z.string(), expected: z.unknown(), current: z.unknown() })).optional().describe("With needs_rebase: what changed under your items."),
  }),
);

const sig = { name: "OPEX-Signature", in: "header", required: true, schema: { type: "string" }, description: "t=<unix seconds>, v1=<hex HMAC-SHA256(secret, t + '.' + raw body)>" };
const js = (s: z.ZodType) => {
  const o = z.toJSONSchema(s, { target: "draft-2020-12", unrepresentable: "any", io: "output", reused: "inline" }) as Record<string, unknown>;
  delete o.$schema;
  return o;
};
const hook = (operationId: string, summary: string, description: string, s: z.ZodType, example: unknown) => ({
  post: {
    operationId,
    summary,
    security: [{ opexSignature: [] }],
    description,
    parameters: [sig],
    requestBody: { required: true, content: { "application/json": { schema: js(s), example } } },
    responses: { "2XX": { description: "Received. Anything else is retried with backoff (at least once)." } },
  },
});

export function WEBHOOKS(audiences?: Audience[]) {
  const all = !audiences;
  const out: Record<string, unknown> = {};
  if (all || audiences.includes("delivery"))
    out.siteContentPublished = hook(
      "webhookSiteContentPublished",
      "Website: content published",
      "Sent to the website's SITE_WEBHOOK_URL (`/api/opex/revalidate`), which refreshes every page that reads OPEX content. Secret: SITE_WEBHOOK_SECRET.",
      ContentPublished,
      { id: "evt_01JD8Z…", event: "content.published", data: { entry: "page.printing", slug: "main", revision: "rev_01JD8Y…", publication: "pub_01JD8Z…" }, created: "2026-11-12T09:30:00.000Z" },
    );
  if (all || audiences.includes("partner")) {
    out.partnerCrStateChanged = hook(
      "webhookPartnerCrStateChanged",
      "Partner: change request state changed",
      "Sent to the partner client's webhook URL when one of its change requests moves (auto-approved, approved, published, rejected, needs_rebase, expired…). Secret: the partner's webhook secret.",
      CrStateChanged,
      { id: "evt_01JD9A…", event: "cr.state_changed", data: { cr: "cr_01JD99…", state: "published" }, created: "2026-11-12T09:31:00.000Z" },
    );
    out.partnerContentPublished = hook(
      "webhookPartnerContentPublished",
      "Partner: content published",
      "Sent to every active partner with a webhook URL when content is published, so a partner can refresh what it shows.",
      ContentPublished,
      { id: "evt_01JD8Z…", event: "content.published", data: { entry: "page.printing", slug: "main", revision: "rev_01JD8Y…", publication: "pub_01JD8Z…" }, created: "2026-11-12T09:30:00.000Z" },
    );
  }
  return out;
}
