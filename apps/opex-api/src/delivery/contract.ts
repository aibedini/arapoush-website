import { z } from "zod";
import { Locale, route } from "../openapi/contract.ts";

const EntryOut = z.object({ revision: z.string(), number: z.number(), data: z.unknown().describe("The entry's content (shape: GET /v1/partner/schema or packages/schema)."), publishedAt: z.string().optional().describe("When this revision was published (sitemap lastmod).") });
const Bundle = z.object({
  generatedAt: z.string(),
  types: z.array(z.string()).describe("Every content type key OPEX knows."),
  entries: z.record(z.string(), EntryOut).describe("Published entries by type key, plus published forms as `form.<slug>` and the public site settings as `settings.site`."),
});

const tags = ["Delivery"];
export const DELIVERY = {
  bundle: route({
    id: "deliveryBundle",
    method: "GET",
    path: "/v1/delivery/bundle",
    audience: "delivery",
    tags,
    summary: "Everything the website renders, in one call",
    description: "Published content of every type plus published forms. The site fetches it at build time and after each `content.published` webhook. Supports `If-None-Match` (304).",
    auth: "delivery",
    source: "delivery/routes.ts",
    headers: [{ name: "If-None-Match", description: "The ETag of a previous answer." }],
    rateLimit: "3000 per minute per IP",
    responses: {
      200: { description: "The bundle.", schema: Bundle, headers: { ETag: "Changes with any published revision or form version.", "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=86400" } },
      304: { description: "Not modified." },
    },
  }),
  content: route({
    id: "deliveryContent",
    method: "GET",
    path: "/v1/delivery/content/:type",
    audience: "delivery",
    tags,
    summary: "Published content of one type",
    auth: "delivery",
    source: "delivery/routes.ts",
    params: z.object({ type: z.string().max(80) }),
    responses: { 200: { description: "The published entry.", schema: z.object({ type: z.string(), revision: z.string(), number: z.number(), data: z.unknown() }), headers: { ETag: "The revision id." } } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown type or never published." }],
  }),
  preview: route({
    id: "deliveryPreview",
    method: "GET",
    path: "/v1/delivery/preview",
    audience: "delivery",
    tags,
    summary: "Drafts (optionally with one change request applied), for a preview link",
    description: "Called by the website's server while a preview cookie is set. Needs both the delivery token and the signed preview token; drafts never reach the public cache (no-store).",
    auth: "delivery",
    source: "delivery/preview.ts",
    headers: [{ name: "opex-preview", required: true, description: "The preview token from the preview link." }],
    responses: { 200: { description: "Draft entries (and draft forms); a partner link gets published entries plus its change request.", schema: z.object({ preview: z.literal(true), cr: z.string().nullable(), partner: z.boolean().describe("A partner link: published content plus the partner's change request only."), entries: z.record(z.string(), EntryOut) }) } },
    errors: [{ status: 401, code: "UNAUTHENTICATED", when: "Missing, expired or forged preview token." }],
  }),
  managePreview: route({
    id: "createPreviewLink",
    method: "POST",
    path: "/v1/manage/preview",
    audience: "manage",
    tags: ["Content"],
    summary: "A 30-minute website link showing drafts",
    description: "The console's preview and visual editor use it. Add `&edit=1` to the URL for the visual editor's in-place editing mode.",
    auth: "session",
    role: "viewer",
    source: "delivery/preview.ts",
    body: z.strictObject({ type: z.string().max(80).describe("Decides which page opens."), locale: Locale.default("fa"), cr: z.string().max(40).optional().describe("Apply this change request's items on top."),
      query: z
        .string()
        .max(200)
        .regex(/^[\w=&.-]*$/)
        .optional()
        .describe("Query string for the page, e.g. `shape=circular&d=30&cap=conical` to open the tube configurator on one closure."),
    }),
    responses: { 200: { description: "The link.", schema: z.object({ url: z.string(), expiresIn: z.number() }) } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "Unknown content type." }],
    audit: ["content.preview"],
  }),
};
