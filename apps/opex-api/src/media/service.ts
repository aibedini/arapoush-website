import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Deps } from "../app.ts";
import { audit, type Actor, type RequestInfo } from "../audit/audit.ts";
import { badRequest } from "../http/problem.ts";
import { sha256, ulid } from "../ids.ts";
import { checkPdf, checkSvg, clamScan, MIME, PASSTHROUGH, reencode, Rejected, sniff, type Compression, type Kind } from "./inspect.ts";

export type Asset = { id: string; url: string; mime: string; bytes: number; width: number | null; height: number | null; status: string; scan: string };

/** File extension per stored type (the public URL ends with it). */
const EXT_OF: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "model/gltf-binary": "glb",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
};
/** Extensions the public and preview routes serve. */
export const MEDIA_EXT = "webp|jpg|png|gif|avif|svg|pdf|ai|glb|mp4|webm|woff2|woff|ttf|otf";

/**
 * Stores an upload after inspection. Raster images are re-encoded (`compress`: see inspect.ts;
 * without it WebP 88 as before), SVG and PDF are checked, videos and fonts are kept as uploaded.
 */
export async function ingest(deps: Deps, o: { buf: Buffer; name: string; actor: Actor; request: RequestInfo; allow?: Kind[]; compress?: Compression }): Promise<Asset> {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const reject = async (reason: string) => {
    await db.tx((q) => audit(q, tenant, { action: "media.rejected", result: "failure", actor: o.actor, request: o.request, resource: { name: o.name.slice(0, 200), bytes: o.buf.length }, reason }));
    return badRequest("MEDIA_REJECTED", reason);
  };
  const kind = sniff(o.buf);
  if (!kind || (o.allow && !o.allow.includes(kind))) throw await reject(`File type not allowed${kind ? ` (${kind})` : ""}`);
  if (/\.ai$/i.test(o.name) && kind !== "pdf") throw await reject("Illustrator files must be PDF-compatible");

  let stored = o.buf;
  let width: number | null = null;
  let height: number | null = null;
  let mime = MIME[kind];
  let ext = EXT_OF[mime]!;
  try {
    if (kind === "svg") checkSvg(o.buf.toString("utf8"));
    else if (kind === "pdf") {
      checkPdf(o.buf);
      if (/\.ai$/i.test(o.name)) ext = "ai";
    } else if (!PASSTHROUGH.includes(kind)) {
      const r = await reencode(o.buf, o.compress ?? "standard", kind);
      stored = r.buf;
      width = r.width;
      height = r.height;
      mime = r.mime;
      ext = EXT_OF[mime]!;
    }
  } catch (e) {
    throw await reject(e instanceof Rejected ? e.message : "File could not be processed");
  }

  let scan = "skipped";
  if (config.CLAMAV) {
    try {
      scan = await clamScan(config.CLAMAV, o.buf);
    } catch {
      throw await reject("Virus scanner unavailable; try again later");
    }
    if (scan.startsWith("infected")) throw await reject(`Malware detected: ${scan.slice(9)}`);
  }

  const hash = sha256(stored);
  const [dup] = await db.q<Asset & { sha256: string; id: string }>(`SELECT id, mime, bytes, width, height, status, scan FROM assets WHERE tenant_id = $1 AND sha256 = $2`, [tenant, hash]);
  if (dup) return { ...dup, url: `/media/${dup.id}.${extOf(dup.mime)}` };

  const id = ulid("ast_");
  mkdirSync(config.MEDIA_DIR, { recursive: true });
  writeFileSync(path.join(config.MEDIA_DIR, `${id}.${ext}`), stored, { mode: 0o640 });
  await db.tx(async (q) => {
    await q(
      `INSERT INTO assets (id, tenant_id, sha256, mime, bytes, width, height, original_name, status, scan, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'clean',$9,$10)`,
      [id, tenant, hash, mime, stored.length, width, height, o.name.slice(0, 200), scan, o.actor.id],
    );
    await audit(q, tenant, { action: "media.upload", actor: o.actor, request: o.request, resource: { type: "asset", id, mime, bytes: stored.length, width, height, scan, name: o.name.slice(0, 200) } });
  });
  return { id, url: `/media/${id}.${ext}`, mime, bytes: stored.length, width, height, status: "clean", scan };
}

export const extOf = (mime: string) => EXT_OF[mime] ?? "webp";
