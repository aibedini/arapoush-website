import { z } from "zod";
import { route } from "../openapi/contract.ts";

const S = "docs/routes.ts";
const tags = ["Documentation"];
const html = { description: "The interactive reference (Scalar), CSP-locked to this origin.", contentType: "text/html" };
const js = { description: "JavaScript.", contentType: "text/javascript" };
export const DOCS = {
  scalar: route({ id: "docsAssetScalar", method: "GET", path: "/v1/docs/assets/scalar.js", audience: "ops", tags, summary: "Reference viewer script (Scalar, self-hosted)", auth: "none", source: S, responses: { 200: js } }),
  init: route({ id: "docsAssetInit", method: "GET", path: "/v1/docs/assets/init.js", audience: "ops", tags, summary: "Reference viewer bootstrap", auth: "none", source: S, responses: { 200: js } }),
  partner: route({ id: "docsPartner", method: "GET", path: "/docs/partner", audience: "partner", tags: ["Partner"], summary: "Interactive Partner API reference (this document)", auth: "none", source: S, responses: { 200: html } }),
  internal: route({ id: "docsInternal", method: "GET", path: "/v1/manage/docs", audience: "manage", tags, summary: "Interactive reference of every route (console sign-in)", auth: "session", role: "viewer", source: S, responses: { 200: html } }),
  opex: route({ id: "docsOpexSpec", method: "GET", path: "/v1/manage/docs/opex.json", audience: "manage", tags, summary: "The full OPEX OpenAPI document", auth: "session", role: "viewer", source: S, responses: { 200: { description: "OpenAPI 3.1.", schema: z.record(z.string(), z.unknown()) } } }),
  site: route({ id: "docsSiteSpec", method: "GET", path: "/v1/manage/docs/site.json", audience: "manage", tags, summary: "The website routes OpenAPI document", auth: "session", role: "viewer", source: S, responses: { 200: { description: "OpenAPI 3.1.", schema: z.record(z.string(), z.unknown()) } } }),
};
