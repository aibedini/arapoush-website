import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { partnerSpec } from "../openapi/specs.ts";

/**
 * The Partner API description (OpenAPI 3.1) at /v1/partner/openapi.json: generated from the route
 * contracts (src/openapi), the same document committed as docs/api/partner.openapi.json, with this
 * server's own URL.
 */
export async function openApiModule(app: FastifyInstance, deps: Deps) {
  const doc = partnerSpec(deps.config.PUBLIC_URL);
  app.get("/v1/partner/openapi.json", async (_req, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return doc;
  });
}
