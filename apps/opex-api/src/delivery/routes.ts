import type { FastifyInstance, FastifyRequest } from "fastify";
import { CONTENT_TYPES } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { forbidden, notFound, unauthorized } from "../http/problem.ts";
import { safeEqual } from "../ids.ts";

/**
 * Delivery API: published content only, for the website's server (never browsers). Bearer token
 * compared in constant time; responses are cacheable with ETags.
 */
export async function deliveryModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const guard = async (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };
  const cache = { "Cache-Control": "private, max-age=0, s-maxage=60, stale-while-revalidate=86400" };

  const published = async (types?: string[]) =>
    db.q<{ type_key: string; slug: string; revision_id: string; number: number; data: unknown; published_at: Date }>(
      `SELECT e.type_key, e.slug, r.id AS revision_id, r.number, r.data, r.created_at AS published_at
         FROM entries e JOIN revisions r ON r.id = e.published_revision_id
        WHERE e.tenant_id = $1 ${types ? "AND e.type_key = ANY($2)" : ""} ORDER BY e.type_key`,
      types ? [tenant, types] : [tenant],
    );

  // Everything the site renders, in one call (build time and revalidation).
  app.get("/v1/delivery/bundle", { preHandler: guard, config: { rateLimit: { max: 3000, timeWindow: "1 minute" } } }, async (req, reply) => {
    const rows = await published();
    const etag = `"${rows.map((r) => r.revision_id).join(".")}"`;
    reply.headers({ ...cache, ETag: etag });
    if (req.headers["if-none-match"] === etag) return reply.status(304).send();
    return { generatedAt: new Date().toISOString(), types: CONTENT_TYPES.map((t) => t.key), entries: Object.fromEntries(rows.map((r) => [r.type_key, { revision: r.revision_id, number: r.number, data: r.data }])) };
  });

  app.get("/v1/delivery/content/:type", { preHandler: guard }, async (req, reply) => {
    const { type } = req.params as { type: string };
    const [row] = await published([type]);
    if (!row) throw notFound("Published content");
    reply.headers({ ...cache, ETag: `"${row.revision_id}"` });
    return { type: row.type_key, revision: row.revision_id, number: row.number, data: row.data };
  });
}
