import { z } from "zod";
import { Iso, route } from "../openapi/contract.ts";

const S = "seo/routes.ts";
const tags = ["SEO engine"];
const Sev = z.enum(["critical", "high", "medium", "low", "info"]);
const Issue = z.object({ rule: z.string(), severity: Sev, category: z.string(), message: z.string(), detail: z.string().optional() });
const Summary = z.object({ id: z.string(), trigger: z.enum(["manual", "schedule", "publish"]), status: z.enum(["running", "done", "failed"]), base_url: z.string(), score: z.number().nullable(), counts: z.record(z.string(), z.number()).nullable(), error: z.string().nullable(), created_at: Iso, finished_at: Iso.nullable() });

export const SEO = {
  list: route({
    id: "listSeoReports",
    method: "GET",
    path: "/v1/manage/seo/reports",
    audience: "manage",
    tags,
    summary: "SEO engine runs, newest first",
    auth: "session",
    role: "viewer",
    source: S,
    responses: { 200: { description: "Up to 60.", schema: z.array(Summary) } },
  }),
  get: route({
    id: "getSeoReport",
    method: "GET",
    path: "/v1/manage/seo/reports/:id",
    audience: "manage",
    tags,
    summary: "One SEO report: scores per category, site issues and every page's issues",
    auth: "session",
    role: "viewer",
    source: S,
    params: z.object({ id: z.string().regex(/^seo_[0-9A-Z]{26}$/) }),
    responses: {
      200: {
        description: "The report.",
        schema: Summary.extend({
          categories: z.record(z.string(), z.number()),
          site: z.array(Issue),
          pages: z.array(z.object({ url: z.string(), status: z.number(), ms: z.number(), bytes: z.number(), score: z.number(), title: z.string().nullable(), issues: z.array(Issue) })),
        }),
      },
    },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such report." }],
  }),
  run: route({
    id: "runSeo",
    method: "POST",
    path: "/v1/manage/seo/run",
    audience: "manage",
    tags,
    summary: "Check the live site now",
    description: "Crawls the sitemap (and Settings → SEO extra paths) and runs every rule: technical, on-page, hreflang, structured data, images, links, GEO/AI readiness, SXO, speed and security headers.",
    auth: "session",
    role: "operator",
    source: S,
    responses: { 200: { description: "Started; poll the report.", schema: z.object({ id: z.string() }) } },
    errors: [{ status: 409, code: "SEO_RUNNING", when: "A check is already running." }],
    rateLimit: "10 per hour",
    audit: ["seo.run"],
  }),
};
