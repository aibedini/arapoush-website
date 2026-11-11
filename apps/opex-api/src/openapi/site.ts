import { z } from "zod";
import { route, type RouteContract } from "./contract.ts";
import { Submission } from "../forms/contract.ts";

/**
 * The website's own HTTP routes (apps/web, Next.js route handlers and metadata routes). They are not
 * OPEX routes, but they are part of the system's contract: browsers post forms here, OPEX calls the
 * revalidate webhook, the console opens previews, crawlers read llms.txt. openapi.test.ts checks that
 * every route file under apps/web/app has a contract here.
 */
const Fallback = z.object({ fallback: z.literal(true) }).describe("OPEX is off or unreachable: the page falls back to opening the visitor's email app.");
const tags = ["Website"];
const site = { audience: "site" as const, tags, auth: "none" as const };

export const SITE: Record<string, RouteContract> = {
  form: route({
    ...site,
    id: "siteSubmitForm",
    method: "POST",
    path: "/api/forms/:form",
    summary: "A visitor sends a form (the browser posts here; the server forwards to OPEX)",
    description:
      "Adds the visitor's IP and the delivery token, so OPEX credentials never reach the browser. Bot checks here: a filled honeypot (`website`) or a form sent faster than 2.5 s after it was shown (or older than a day) gets 202 and is dropped. Body limit 16 MB (files are base64).",
    source: "apps/web/app/api/forms/[form]/route.ts",
    params: z.object({ form: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/) }),
    body: Submission.extend({ website: z.string().optional().describe("Honeypot: must stay empty."), shownAt: z.number().describe("Date.now() when the form was shown.") }),
    responses: {
      201: { description: "Stored as a ticket.", schema: z.object({ ok: z.literal(true), number: z.number().optional() }) },
      202: { description: "Accepted (or silently dropped as a bot or blocked sender).", schema: z.object({ ok: z.literal(true) }) },
      400: { description: "`invalid` (with OPEX's field `issues`: field id and code) or `bad_json`.", schema: z.object({ error: z.enum(["invalid", "bad_json"]), issues: z.array(z.object({ path: z.string(), message: z.string() })).optional() }) },
      404: { description: "OPEX is not configured, or no such published form.", schema: Fallback },
      413: { description: "Body over 16 MB.", schema: z.object({ error: z.literal("too_large") }) },
      429: { description: "OPEX's per-visitor limit.", schema: z.object({ error: z.literal("rate_limited") }) },
      503: { description: "OPEX unreachable or failing.", schema: Fallback },
    },
  }),
  preview: route({
    ...site,
    id: "siteOpenPreview",
    method: "GET",
    path: "/api/opex/preview",
    summary: "Open a draft preview (link from the OPEX console or a partner preview)",
    description: "Stores the signed token in an HttpOnly cookie (`opex_preview`, 30 minutes; SameSite=None over https so it works inside the console frame), turns on draft mode and redirects to `path`. With `edit=1` the visual editor's bridge loads too (`opex_edit` cookie). `exit=1` leaves preview.",
    source: "apps/web/app/api/opex/preview/route.ts",
    query: z.object({
      token: z.string().max(2000).optional(),
      path: z.string().regex(/^\/(?!\/)[\w\-/]*$/).optional().describe("Same-site path only (never an open redirect)."),
      edit: z.enum(["1"]).optional(),
      exit: z.enum(["1"]).optional(),
    }),
    responses: {
      307: { description: "To `path` (or `/` after exit).", headers: { Location: "The page", "Set-Cookie": "opex_preview / opex_edit" } },
      400: { description: "Bad preview link (malformed token or path).", contentType: "text/plain" },
    },
  }),
  revalidate: route({
    ...site,
    id: "siteRevalidate",
    method: "POST",
    path: "/api/opex/revalidate",
    summary: "Webhook receiver: OPEX published something; refresh the pages",
    description: "Verifies `OPEX-Signature` (HMAC-SHA256 with OPEX_WEBHOOK_SECRET over `t.body`, 5-minute window) and refuses a repeated event id, then revalidates the `opex` cache tag.",
    auth: "none",
    source: "apps/web/app/api/opex/revalidate/route.ts",
    headers: [{ name: "OPEX-Signature", required: true, description: "t=<unix>, v1=<hex HMAC>" }],
    body: z.object({ id: z.string(), event: z.string(), data: z.unknown(), created: z.string() }),
    responses: {
      204: { description: "Refreshed." },
      400: { description: "Body is not JSON." },
      401: { description: "Bad or stale signature (or body over 64 KB)." },
      404: { description: "OPEX_WEBHOOK_SECRET is not set: webhooks are off." },
      409: { description: "Event id already processed (or missing)." },
    },
  }),
  llms: route({ ...site, id: "siteLlmsTxt", method: "GET", path: "/llms.txt", summary: "Site summary for AI assistants (llmstxt.org)", source: "apps/web/app/llms.txt/route.ts", responses: { 200: { description: "Markdown text: pages, contact, indexable form pages.", contentType: "text/plain" } } }),
  llmsFull: route({ ...site, id: "siteLlmsFullTxt", method: "GET", path: "/llms-full.txt", summary: "All site text for AI assistants, per language", source: "apps/web/app/llms-full.txt/route.ts", responses: { 200: { description: "Markdown text: every section, product facts, printing, FAQ blocks.", contentType: "text/plain" } } }),
  sitemap: route({ ...site, id: "siteSitemap", method: "GET", path: "/sitemap.xml", summary: "Sitemap with hreflang alternates and key images", source: "apps/web/app/sitemap.ts", responses: { 200: { description: "XML sitemap (every page in fa, en, tr, plus indexable form pages).", contentType: "application/xml" } } }),
  robots: route({ ...site, id: "siteRobots", method: "GET", path: "/robots.txt", summary: "Crawler rules (AI crawlers allowed)", source: "apps/web/app/robots.ts", responses: { 200: { description: "robots.txt", contentType: "text/plain" } } }),
};
