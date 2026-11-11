import type { FormDefinition } from "@arapoush/schema";
import { publicDefinition } from "../forms/routes.ts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Deps } from "../app.ts";
import type { Config } from "../config.ts";
import { auditNow } from "../audit/audit.ts";
import { requireOperator } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { forbidden, unauthorized } from "../http/problem.ts";
import { sha256, safeEqual, token } from "../ids.ts";
import { typeOrThrow } from "../content/service.ts";
import { getAt, setAt } from "@arapoush/schema";
import { applyItems } from "../cr/merge.ts";

/** Website page that shows each content type (first locale; the editor can switch language there). */
export function pageFor(type: string, locale = "fa") {
  if (type === "page.printing") return `/${locale}/printing`;
  if (type.startsWith("product.tube.")) return `/${locale}/products/multi-layer-tube`;
  if (type.startsWith("product.effervescent.")) return `/${locale}/products/effervescent-tube`;
  return `/${locale}`;
}

// A key of its own, derived from the session secret: a preview token is useless as anything else.
const keyOf = (config: Config) => new Uint8Array(Buffer.from(sha256(`opex-preview:${config.SESSION_SECRET}`), "hex"));

/** A 30-minute preview link for the website: drafts, or drafts with one change request applied. */
export async function previewLink(config: Config, o: { sub: string; type: string; locale: string; cr?: string }) {
  const jti = token(12);
  const jwt = await new SignJWT({ scope: "preview", type: o.type, ...(o.cr ? { cr: o.cr } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(o.sub)
    .setAudience("opex-preview")
    .setIssuer(config.PUBLIC_URL)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(keyOf(config));
  const url = new URL("/api/opex/preview", config.SITE_URL);
  url.searchParams.set("token", jwt);
  url.searchParams.set("path", pageFor(o.type, o.locale));
  return { url: url.toString(), jti, expiresIn: 1800 };
}

/**
 * Draft preview (plan §10.3). The console (or AraCMS, for its own change request) asks for a link;
 * the website stores it and fetches drafts with it; every fetch re-verifies it here.
 */
export async function previewModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;

  app.post("/v1/manage/preview", { preHandler: requireOperator(deps) }, async (req) => {
    const { type, locale, cr } = z.strictObject({ type: z.string().max(80), locale: z.enum(["fa", "en", "tr"]).default("fa"), cr: z.string().max(40).optional() }).parse(req.body ?? {});
    typeOrThrow(type);
    const link = await previewLink(config, { sub: req.principal!.id, type, locale, cr });
    await auditNow(db, tenant, { action: "content.preview", actor: actorOf(req), request: req.info, resource: { type: "entry", entry: type, cr: cr ?? null, jti: link.jti } });
    return { url: link.url, expiresIn: link.expiresIn };
  });

  const deliveryGuard = (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw unauthorized();
    if (!safeEqual(auth.slice(7), config.DELIVERY_TOKEN)) throw forbidden("BAD_TOKEN", "Invalid delivery token");
  };

  // Drafts of every entry (published where there is no draft), plus a CR's items when the link names one.
  app.get("/v1/delivery/preview", async (req, reply) => {
    deliveryGuard(req);
    let payload: { scope?: unknown; cr?: unknown };
    try {
      ({ payload } = await jwtVerify(String(req.headers["opex-preview"] ?? ""), keyOf(config), { audience: "opex-preview", issuer: config.PUBLIC_URL, algorithms: ["HS256"] }));
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
    const entries = Object.fromEntries(rows.map((r) => [r.type_key, { revision: r.revision_id, number: r.number, data: r.data }]));
    if (typeof payload.cr === "string") {
      const items = await db.q<{ type_key: string; id: string; path: string; op: "set" | "insert" | "remove"; old_value: unknown; new_value: unknown }>(
        `SELECT e.type_key, ci.id, ci.path, ci.op, ci.old_value, ci.new_value FROM change_items ci JOIN entries e ON e.id = ci.entry_id JOIN change_requests cr ON cr.id = ci.cr_id
          WHERE ci.cr_id = $1 AND cr.tenant_id = $2 AND (ci.decision IS NULL OR ci.decision = 'approved') ORDER BY ci.position`,
        [payload.cr, tenant],
      );
      for (const type of new Set(items.map((i) => i.type_key))) {
        const e = entries[type];
        if (!e) continue;
        // Preview shows the proposal even if the draft moved on: old values are not enforced here.
        let data = e.data;
        for (const i of items.filter((x) => x.type_key === type)) {
          try {
            if (i.op === "set") data = setAt(data, i.path, i.new_value);
            else if (i.op === "insert") data = setAt(data, i.path, [...((getAt(data, i.path) as unknown[] | undefined) ?? []), i.new_value]);
            else data = applyItems(data, [{ id: i.id, path: i.path, op: "remove", old: getAt(data, i.path), value: null }]).data;
          } catch {
            // a path that no longer exists is skipped in preview
          }
        }
        e.data = data;
      }
    }
    reply.header("Cache-Control", "no-store");
    // Forms preview as drafts (the builder's "view on site").
    const forms = await db.q<{ slug: string; version: number; draft: FormDefinition }>(`SELECT slug, version, draft FROM forms WHERE tenant_id = $1 AND status <> 'archived'`, [tenant]);
    for (const f of forms) (entries as Record<string, unknown>)[`form.${f.slug}`] = { revision: `form.${f.slug}@draft`, number: f.version, data: publicDefinition(f.slug, f.version, f.draft) };
    return { preview: true, cr: payload.cr ?? null, entries };
  });
}
