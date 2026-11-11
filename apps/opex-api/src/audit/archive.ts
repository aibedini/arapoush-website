import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CompactSign, compactVerify, createLocalJWKSet, type JWK } from "jose";
import type { Deps } from "../app.ts";
import { signingKeys } from "../oauth/keys.ts";
import { canonical, sha256 } from "../ids.ts";
import { auditNow, SYSTEM_REQUEST } from "./audit.ts";

/**
 * Write-once audit archive (plan §8.3, P9). Every run appends the audit rows written since the last
 * archive to a new JSONL file, made read-only, plus a manifest (range, chain hashes, file digest)
 * signed with OPEX's token key (ES256, verifiable with /.well-known/jwks.json).
 *
 * AUDIT_ARCHIVE_DIR should be on storage that cannot be rewritten: an S3 bucket with Object Lock in
 * compliance mode (synced with rclone), or a WORM volume. A tampered database then disagrees with
 * the archive, and an archive file cannot be changed without breaking its signed digest.
 */
const SELECT = `SELECT seq, id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts, tenant_id, action, result, actor, request, resource, changes, reason, prev_hash, hash FROM audit_events`;

export type Manifest = { tenant: string; from: number; to: number; count: number; prev_hash: string; last_hash: string; file: string; sha256: string; created: string };

export async function exportArchive(deps: Deps, dir: string, settleSeconds = 60): Promise<Manifest | null> {
  const { db, config } = deps;
  mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, `.last-${config.TENANT}`);
  const last = existsSync(statePath) ? Number(readFileSync(statePath, "utf8")) : 0;
  // Rows a few seconds old only: the chain is append-only, so they never change after commit.
  const rows = await db.q<Record<string, unknown>>(`${SELECT} WHERE tenant_id = $1 AND seq > $2 AND ts < clock_timestamp() - make_interval(secs => $3::int) ORDER BY seq LIMIT 100000`, [config.TENANT, last, settleSeconds]);
  if (!rows.length) return null;
  const from = Number(rows[0]!.seq), to = Number(rows.at(-1)!.seq);
  const name = `audit-${config.TENANT}-${String(from).padStart(10, "0")}-${String(to).padStart(10, "0")}`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const file = path.join(dir, `${name}.jsonl`);
  writeFileSync(file, body, { flag: "wx", mode: 0o444 });
  const manifest: Manifest = { tenant: config.TENANT, from, to, count: rows.length, prev_hash: String(rows[0]!.prev_hash), last_hash: String(rows.at(-1)!.hash), file: `${name}.jsonl`, sha256: sha256(body), created: new Date().toISOString() };
  const keys = await signingKeys(config, { memory: config.NODE_ENV === "test" });
  const jws = await new CompactSign(new TextEncoder().encode(JSON.stringify(manifest))).setProtectedHeader({ alg: "ES256", kid: keys.kid, typ: "opex-audit-manifest" }).sign(keys.privateKey);
  writeFileSync(path.join(dir, `${name}.manifest.jws`), jws, { flag: "wx", mode: 0o444 });
  chmodSync(file, 0o444);
  writeFileSync(statePath, String(to));
  await auditNow(db, config.TENANT, { action: "audit.archived", actor: { kind: "system", id: "archive", display: "Audit archive" }, request: SYSTEM_REQUEST, resource: { from, to, count: rows.length, file: manifest.file, sha256: manifest.sha256 } });
  return manifest;
}

/**
 * Verifies an archive file offline: the signed manifest, the file digest and every row's hash link.
 * `jwks`: OPEX's public keys (GET /.well-known/jwks.json).
 */
export async function verifyArchive(jsonlPath: string, jwks: { keys: JWK[] }): Promise<{ ok: boolean; reason?: string; manifest?: Manifest }> {
  const body = readFileSync(jsonlPath, "utf8");
  let manifest: Manifest;
  try {
    const { payload } = await compactVerify(readFileSync(jsonlPath.replace(/\.jsonl$/, ".manifest.jws"), "utf8"), createLocalJWKSet(jwks as never));
    manifest = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return { ok: false, reason: "manifest signature does not verify" };
  }
  if (sha256(body) !== manifest.sha256) return { ok: false, reason: "file digest differs from the signed manifest", manifest };
  let prev = manifest.prev_hash;
  for (const line of body.trim().split("\n")) {
    const r = JSON.parse(line) as Record<string, unknown>;
    const record = { id: r.id, ts: r.ts, tenant_id: r.tenant_id, action: r.action, result: r.result, actor: r.actor, request: r.request, resource: r.resource ?? null, changes: r.changes ?? null, reason: r.reason ?? null };
    if (r.prev_hash !== prev || sha256(String(r.prev_hash) + canonical(record)) !== r.hash) return { ok: false, reason: `row ${String(r.seq)} breaks the chain`, manifest };
    prev = String(r.hash);
  }
  if (prev !== manifest.last_hash) return { ok: false, reason: "last hash differs from the manifest", manifest };
  return { ok: true, manifest };
}
