import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { requirePartner } from "../oauth/bearer.ts";

/** Partner API (AraCMS). P2: identity check; P6 adds content, media and change requests. */
export async function partnerModule(app: FastifyInstance, deps: Deps) {
  app.get("/v1/partner/me", { preHandler: requirePartner(deps, "content:read") }, async (req) => {
    const p = req.principal!;
    return { id: p.id, kind: p.kind, display: p.display, role: p.role, client: p.clientId, scopes: p.scopes };
  });
}
