import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Deps } from "../app.ts";
import { requireOperator } from "../auth/guards.ts";
import { fullSpec, siteSpec } from "../openapi/specs.ts";

/**
 * Readable API references (D3), rendered by Scalar from the generated OpenAPI documents. Scalar is
 * served from this API (no CDN), under a CSP that allows only this origin.
 * - /docs/partner: public, the Partner API only (what AraCMS builds against).
 * - /v1/manage/docs: the full internal reference (OPEX, website routes, partner), console sign-in.
 */
const scalarFile = path.join(path.dirname(fileURLToPath(import.meta.resolve("@scalar/api-reference"))), "browser", "standalone.js");
let scalar: Buffer | null = null;
const INIT = `(() => {
  const el = document.getElementById("app");
  const cfg = JSON.parse(el.dataset.config);
  window.Scalar.createApiReference(el, cfg);
})();
`;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

function page(reply: FastifyReply, title: string, config: unknown) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  reply.header("Content-Security-Policy", CSP).header("Cache-Control", "no-store").type("text/html; charset=utf-8");
  return reply.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body><div id="app" data-config="${esc(JSON.stringify(config))}"></div><script src="/v1/docs/assets/scalar.js"></script><script src="/v1/docs/assets/init.js"></script></body></html>`);
}

const common = { theme: "default", layout: "modern", hideClientButton: false, withDefaultFonts: false, defaultHttpClient: { targetKey: "php", clientKey: "curl" }, hideDarkModeToggle: false, persistAuth: false };

export async function docsModule(app: FastifyInstance, deps: Deps) {
  const { config } = deps;
  const opex = fullSpec(config.PUBLIC_URL);
  const site = siteSpec(config.SITE_URL);

  app.get("/v1/docs/assets/scalar.js", async (_req, reply) => {
    scalar ??= readFileSync(scalarFile);
    reply.header("Cache-Control", "public, max-age=86400").type("text/javascript; charset=utf-8");
    return reply.send(scalar);
  });
  app.get("/v1/docs/assets/init.js", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=3600").type("text/javascript; charset=utf-8");
    return reply.send(INIT);
  });

  app.get("/docs/partner", async (_req, reply) => page(reply, "OPEX Partner API", { ...common, url: "/v1/partner/openapi.json", metaData: { title: "OPEX Partner API" } }));

  const viewer = requireOperator(deps, "viewer");
  app.get("/v1/manage/docs", { preHandler: viewer }, async (_req, reply) =>
    page(reply, "OPEX API reference", {
      ...common,
      sources: [
        { title: "OPEX (all routes)", slug: "opex", url: "/v1/manage/docs/opex.json" },
        { title: "Website routes", slug: "site", url: "/v1/manage/docs/site.json" },
        { title: "Partner API", slug: "partner", url: "/v1/partner/openapi.json" },
      ],
    }),
  );
  app.get("/v1/manage/docs/opex.json", { preHandler: viewer }, async () => opex);
  app.get("/v1/manage/docs/site.json", { preHandler: viewer }, async () => site);
}
