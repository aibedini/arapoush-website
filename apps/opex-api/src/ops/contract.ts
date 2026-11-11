import { z } from "zod";
import { route } from "../openapi/contract.ts";

const tags = ["Operations"];
export const OPS = {
  healthz: route({ id: "healthz", method: "GET", path: "/healthz", audience: "ops", tags, summary: "Liveness", auth: "none", source: "app.ts", responses: { 200: { description: "The process answers.", schema: z.object({ ok: z.literal(true) }) } } }),
  readyz: route({
    id: "readyz",
    method: "GET",
    path: "/readyz",
    audience: "ops",
    tags,
    summary: "Readiness (database reachable)",
    auth: "none",
    source: "app.ts",
    responses: {
      200: { description: "Ready.", schema: z.object({ ok: z.literal(true), db: z.enum(["pg", "pglite"]) }) },
      503: { description: "The database does not answer.", schema: z.object({ ok: z.literal(false) }) },
    },
  }),
  metrics: route({
    id: "metrics",
    method: "GET",
    path: "/metrics",
    audience: "ops",
    tags,
    summary: "Prometheus metrics",
    description: "Counters and gauges for alerting (docs/opex/runbooks/alerts.md): audit chain, webhooks, change requests, tickets, emails, sessions.",
    auth: "metrics",
    source: "ops/metrics.ts",
    rateLimit: "120 per minute per IP",
    responses: { 200: { description: "Text exposition format 0.0.4.", contentType: "text/plain" } },
  }),
  partnerSpec: route({
    id: "partnerOpenApi",
    method: "GET",
    path: "/v1/partner/openapi.json",
    audience: "partner",
    tags: ["Partner"],
    summary: "This API description (OpenAPI 3.1, partner view)",
    auth: "none",
    source: "partner/openapi.ts",
    responses: { 200: { description: "The partner OpenAPI document (generated from the route contracts).", schema: z.record(z.string(), z.unknown()) } },
  }),
};
