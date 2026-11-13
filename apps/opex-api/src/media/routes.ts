import { MEDIA } from "./contract.ts";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, notFound } from "../http/problem.ts";
import { ingest } from "./service.ts";

export async function readUpload(req: FastifyRequest) {
  const file = await req.file();
  if (!file) throw badRequest("NO_FILE", "Send one file as multipart/form-data");
  const buf = await file.toBuffer();
  if (file.file.truncated) throw badRequest("TOO_LARGE", "File is larger than 25 MB");
  return { buf, name: file.filename };
}

/**
 * Media: operator uploads and library, and the public file route. A file is publicly served only
 * after a revision referencing it was published; operators can preview unpublished files.
 */
export async function mediaModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;

  app.post("/v1/manage/media", { preHandler: requireOperator(deps, "operator"), config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req) => {
    const { buf, name } = await readUpload(req);
    return ingest(deps, { buf, name, actor: actorOf(req), request: req.info });
  });

  app.get("/v1/manage/media", { preHandler: requireOperator(deps) }, async (req) => {
    const { q, cursor } = MEDIA.list.query.parse(req.query);
    return db.q(
      `SELECT a.id, a.mime, a.bytes, a.width, a.height, a.original_name, a.status, a.scan, a.public, a.created_at, p.display_name AS uploaded_by
         FROM assets a LEFT JOIN principals p ON p.id = a.uploaded_by
        WHERE a.tenant_id = $1 ${q ? "AND a.original_name ILIKE $2" : ""} ${cursor ? `AND a.id < $${q ? 3 : 2}` : ""}
        ORDER BY a.id DESC LIMIT 60`,
      [tenant, ...(q ? [`%${q.slice(0, 80)}%`] : []), ...(cursor ? [cursor] : [])],
    );
  });

  const send = (reply: import("fastify").FastifyReply, file: string, mime: string, publicCache: boolean) => {
    reply.header("Content-Type", mime);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (mime === "application/pdf" && /\.ai$/.test(file)) reply.header("Content-Disposition", "attachment");
    reply.header("Cache-Control", publicCache ? "public, max-age=31536000, immutable" : "private, no-store");
    return reply.send(createReadStream(file));
  };

  // Public, immutable media (ids never change content).
  app.get("/media/:file", { config: { rateLimit: { max: 3000, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { file } = req.params as { file: string };
    const m = /^(ast_[0-9A-Z]{26})\.(webp|svg|pdf|ai|glb)$/.exec(file);
    if (!m) throw notFound("Media");
    const [a] = await db.q<{ mime: string; public: boolean; status: string }>(`SELECT mime, public, status FROM assets WHERE id = $1 AND tenant_id = $2`, [m[1], tenant]);
    if (!a || !a.public || a.status !== "clean") throw notFound("Media");
    const p = path.join(config.MEDIA_DIR, file);
    if (!existsSync(p)) throw notFound("Media");
    return send(reply, p, a.mime, true);
  });

  // Operator preview of unpublished media.
  app.get("/v1/manage/media/:file/raw", { preHandler: requireOperator(deps) }, async (req, reply) => {
    const { file } = req.params as { file: string };
    const m = /^(ast_[0-9A-Z]{26})\.(webp|svg|pdf|ai|glb)$/.exec(file);
    if (!m) throw notFound("Media");
    const [a] = await db.q<{ mime: string; status: string }>(`SELECT mime, status FROM assets WHERE id = $1 AND tenant_id = $2`, [m[1], tenant]);
    const p = path.join(config.MEDIA_DIR, file);
    if (!a || !existsSync(p)) throw notFound("Media");
    // Unscanned or rejected files only for people who can upload (S2).
    if (a.status !== "clean" && !req.principal!.permissions?.has("media.upload")) throw notFound("Media");
    return send(reply, p, a.mime, false);
  });
}
