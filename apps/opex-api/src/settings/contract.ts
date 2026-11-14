import { z } from "zod";
import { Iso, Ok, route } from "../openapi/contract.ts";

const S = "settings/routes.ts";
const tags = ["Settings"];

/** Only identifiers, never free HTML: the site builds the tags itself (S3, no stored script). */
export const AnalyticsSettings = z.strictObject({
  ga4: z.string().regex(/^G-[A-Z0-9]{4,12}$/).nullable().default(null).describe("Google Analytics 4 measurement id (G-…)."),
  gtm: z.string().regex(/^GTM-[A-Z0-9]{4,10}$/).nullable().default(null).describe("Google Tag Manager container (GTM-…)."),
  clarity: z.string().regex(/^[a-z0-9]{6,12}$/).nullable().default(null).describe("Microsoft Clarity project id."),
  yandex: z.string().regex(/^\d{5,12}$/).nullable().default(null).describe("Yandex Metrica counter."),
  matomo: z.strictObject({ url: z.string().url().regex(/^https:\/\//), siteId: z.string().regex(/^\d{1,6}$/) }).nullable().default(null),
  consent: z.boolean().default(true).describe("Load analytics only after the visitor accepts (cookie banner)."),
  verification: z
    .strictObject({
      google: z.string().regex(/^[\w-]{10,100}$/).nullable().default(null),
      bing: z.string().regex(/^[\w-]{10,100}$/).nullable().default(null),
      yandex: z.string().regex(/^[\w-]{10,100}$/).nullable().default(null),
    })
    .default({ google: null, bing: null, yandex: null })
    .describe("Search console verification tokens (meta tags)."),
});
export const SeoSettings = z.strictObject({
  indexing: z.boolean().default(true).describe("Off: every page says noindex (staging)."),
  schedule: z.enum(["off", "daily", "weekly"]).default("daily").describe("How often the SEO engine checks the live site."),
  afterPublish: z.boolean().default(true).describe("Also check after each publish."),
  minScore: z.number().int().min(0).max(100).default(85).describe("Below this score the dashboard warns."),
  pages: z.array(z.string().regex(/^\/[\w\-/]*$/).max(200)).max(100).default([]).describe("Extra paths to check besides the sitemap."),
});
export const SecuritySettings = z.strictObject({
  contactEmail: z.string().email().max(200).nullable().default(null).describe("Published in /.well-known/security.txt."),
  policyUrl: z.string().url().regex(/^https:\/\//).nullable().default(null),
});
export const SECTIONS = { analytics: AnalyticsSettings, seo: SeoSettings, security: SecuritySettings } as const;
export type Section = keyof typeof SECTIONS;
export type SiteSettings = { analytics: z.infer<typeof AnalyticsSettings>; seo: z.infer<typeof SeoSettings>; security: z.infer<typeof SecuritySettings> };

const Status = z.object({
  ssl: z.object({ https: z.boolean(), validTo: Iso.nullable(), issuer: z.string().nullable(), daysLeft: z.number().nullable(), error: z.string().nullable() }),
  headers: z.array(z.object({ name: z.string(), present: z.boolean(), value: z.string().nullable() })).describe("Security headers on the live home page."),
  env: z.object({ siteUrl: z.string(), publicUrl: z.string(), consoleAllowlist: z.array(z.string()), turnstile: z.boolean(), mail: z.boolean(), clamav: z.boolean() }),
});

const Level = z.enum(["ok", "warn", "fail"]);
const Overview = z.object({
  generatedAt: Iso,
  score: z.number().int().min(0).max(100).describe("Share of best-practice checks passed (warnings count half)."),
  services: z.array(z.object({ id: z.enum(["database", "website", "scanner", "mail", "renderer"]), ok: z.boolean(), latencyMs: z.number().nullable(), detail: z.string().nullable() })),
  host: z.object({
    memTotalBytes: z.number(),
    memAvailableBytes: z.number(),
    swapTotalBytes: z.number(),
    swapFreeBytes: z.number(),
    cpus: z.number(),
    load: z.array(z.number()),
    uptimeSeconds: z.number(),
    apiRssBytes: z.number(),
    apiUptimeSeconds: z.number(),
    node: z.string(),
  }),
  disks: z.array(z.object({ id: z.string(), path: z.string(), totalBytes: z.number(), freeBytes: z.number() })),
  storage: z.object({ databaseBytes: z.number(), mediaBytes: z.number(), mediaFiles: z.number(), backupsBytes: z.number(), backupFiles: z.number(), auditEvents: z.number() }),
  activity: z.object({
    entries: z.number(),
    published: z.number(),
    drafts: z.number(),
    assets: z.number(),
    assetBytes: z.number(),
    ticketsOpen: z.number(),
    ticketsWeek: z.number(),
    operators: z.number(),
    lockedOperators: z.number(),
    lastBackupAt: Iso.nullable(),
    lastBackupBytes: z.number().nullable(),
    lastSeoAt: Iso.nullable(),
    lastSeoScore: z.number().nullable(),
    lastRenderAt: Iso.nullable(),
  }),
  ssl: Status.shape.ssl,
  checks: z.array(z.object({ id: z.string(), area: z.enum(["security", "reliability", "performance", "seo", "operations"]), level: Level, value: z.string().nullable() })),
});

export const SETTINGS = {
  overview: route({
    id: "getSystemOverview",
    method: "GET",
    path: "/v1/manage/system/overview",
    audience: "manage",
    tags,
    summary: "System overview: service health, memory, disk, storage, queues and best-practice checks",
    description: "Computed on request and cached for 20 seconds (`fresh=1` skips the cache). Per-container memory is not visible to the API (it has no Docker access by design); `sudo arapoush status` on the server shows it.",
    auth: "session",
    role: "viewer",
    source: S,
    query: z.object({ fresh: z.enum(["1"]).optional() }),
    responses: { 200: { description: "The overview.", schema: Overview } },
  }),
  get: route({
    id: "getSettings",
    method: "GET",
    path: "/v1/manage/settings",
    audience: "manage",
    tags,
    summary: "Site settings and live status (SSL, security headers)",
    description: "Company details, logo, addresses and the footer are content (`global.site`), edited in the console like any page. This route holds the rest.",
    auth: "session",
    role: "viewer",
    source: S,
    responses: { 200: { description: "Every section with defaults filled in, plus status.", schema: z.object({ analytics: AnalyticsSettings, seo: SeoSettings, security: SecuritySettings, updated: z.record(z.string(), z.object({ at: Iso, by: z.string().nullable() })), status: Status }) } },
  }),
  put: route({
    id: "putSettings",
    method: "PUT",
    path: "/v1/manage/settings/:section",
    audience: "manage",
    tags,
    summary: "Save one settings section",
    description: "The website is told to refresh (signed webhook), so analytics and indexing apply within seconds.",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: z.object({ section: z.enum(["analytics", "seo", "security"]) }),
    body: z.record(z.string(), z.unknown()).describe("The section's fields (see the GET answer)."),
    responses: { 200: { description: "Saved.", schema: Ok } },
    audit: ["settings.update"],
  }),
};
