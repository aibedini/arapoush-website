import type { FastifyInstance, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { forbidden, unauthorized } from "../http/problem.ts";
import { sha256, safeEqual, token } from "../ids.ts";
import { typeOrThrow } from "../content/service.ts";

/** Website page that shows each content type (first locale; the editor can switch language there). */
export function pageFor(type: string, locale = "fa") {
  if (type === "page.printing") return `/${locale}/printing`;
  if (type.startsWith("product.tube.")) return `/${locale}/products/multi-layer-tube`;
  if (type.startsWith("product.effervescent.")) return `/${locale}/products/effervescent-tube`;
  return `/${locale}`;
}

/**
 * Draft preview (plan §10.3). The console asks for a link; OPEX signs a 30-minute token naming the
 * operator. The website stores it and fetches drafts with it; every fetch re-verifies it here.
 */
export async function previewModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  // A key of its own, derived from the session secret: a preview token is useless as anything else.
  const key = new Uint8Array(Buffer.from(sha256(`opex-preview:${config.SESSION_SECRET}`), "hex"));

  app.post("/v1/manage/preview", { preHandler: requireOperator(deps) }, async (req) => {
    const { type, locale } = z.strictObject({ type: z.string().max(80), locale: z.enum(["fa", "en", "tr"]).default("fa") }).parse(req.body ?? {});
    typeOrThrow(type);
    const jti = token(12);
    const jwt = await new SignJWT({ scope: "preview", type })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(req.principal!.id)
      .setAudience("opex-preview")
      .setIssuer(config.PUBLIC_URL)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(key);
    await auditNow(db, tenant, { action: "content.preview", actor: actorOf(req), request: req.info, resource: { type: "entry", entry: type, jti } });
    const url = new URL("/api/opex/preview", config.SITE_URL);
    url.searchParams.set("token", jwt);
    url.searchParams.set("path", pageFor(type, locale));
    return { url: url.toString(), expiresIn: 1800 };
  });

  const deliveryGuard = (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };

  // Drafts of every entry (falls back to the published revision where there is no draft).
  app.get("/v1/delivery/preview", async (req, reply) => {
    deliveryGuard(req);
    const raw = String(req.headers["opex-preview"] ?? "");
    try {
      const { payload } = await jwtVerify(raw, key, { audience: "opex-preview", issuer: config.PUBLIC_URL, algorithms: ["HS256"] });
      if (payload.scope !== "preview") throw new Error();
    } catch {
      throw unauthorized("Preview link expired");
    }
    const rows = await db.q<{ type_key: string; revision_id: string; number: number; data: unknown }>(
      `SELECT e.type_key, r.id AS revision_id, r.number, r.data
         FROM entries e JOIN revisions r ON r.id = COALESCE(e.draft_revision_id, e.published_revision_id)
        WHERE e.tenant_id = $1 ORDER BY e.type_key`,
      [tenant],
    );
    reply.header("Cache-Control", "no-store");
    return { preview: true, entries: Object.fromEntries(rows.map((r) => [r.type_key, { revision: r.revision_id, number: r.number, data: r.data }])) };
  });
}
