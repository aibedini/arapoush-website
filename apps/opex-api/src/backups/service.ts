import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { Deps } from "../app.ts";
import type { Q } from "../db/index.ts";
import { ulid } from "../ids.ts";
import { inquiryKeys } from "../inquiries/crypto.ts";
import { assertPublicUrl } from "../net/ssrf.ts";
import { BackupConfig, type BackupKind, type BackupConfigT } from "./contract.ts";

/**
 * S4: whole-site backups. An archive is a zip (manifest, one NDJSON file per table, media files),
 * encrypted with AES-256-GCM. Restore replaces the chosen tables (and media) in one transaction,
 * after an automatic safety backup.
 *
 * Never backed up or restored: live credentials of the moment (sessions, refresh tokens, OAuth
 * codes, replay caches) and the append-only audit log, which a restore must not be able to rewrite.
 */
const NEVER = new Set(["sessions", "refresh_tokens", "oauth_codes", "revoked_jti", "jti_seen", "idempotency_keys", "audit_events", "schema_migrations", "backups"]);
/** "Content only": what the site shows and the forms it collects with, not people or tickets. */
const CONTENT = ["content_types", "entries", "revisions", "publications", "assets", "forms", "form_versions", "site_settings", "cad_models", "render_jobs", "approval_policies", "blog_authors", "blog_categories", "blog_tags", "blog_posts", "blog_revisions", "blog_slugs", "blog_comments"];
const MAGIC = Buffer.from("OPEXBAK1");

/** BACKUP_KEY when set (keep it outside the server!), else derived from INQUIRY_KEY. */
export const backupKey = (deps: Deps) => createHash("sha256").update(`opex-backup:${deps.config.BACKUP_KEY ?? deps.config.INQUIRY_KEY}`).digest();

function encrypt(key: Buffer, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function decrypt(key: Buffer, file: Buffer): Uint8Array {
  if (file.length < 36 || !file.subarray(0, 8).equals(MAGIC)) throw new Error("NOT_A_BACKUP");
  const d = createDecipheriv("aes-256-gcm", key, file.subarray(8, 20));
  d.setAuthTag(file.subarray(20, 36));
  try {
    return Buffer.concat([d.update(file.subarray(36)), d.final()]);
  } catch {
    throw new Error("WRONG_KEY_OR_DAMAGED");
  }
}

/** Base tables of the app, in an order where parents come before children (foreign keys). */
export async function tableOrder(q: Q): Promise<string[]> {
  const tables = (await q<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => !NEVER.has(t));
  const fks = await q<{ child: string; parent: string }>(
    `SELECT tc.table_name AS child, ccu.table_name AS parent FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema()`,
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, depth = 0) => {
    if (seen.has(t) || depth > 50) return;
    seen.add(t);
    for (const f of fks) if (f.child === t && f.parent !== t && tables.includes(f.parent)) visit(f.parent, depth + 1);
    out.push(t);
  };
  for (const t of tables.sort()) visit(t);
  return out;
}

const tablesFor = (all: string[], kind: BackupKind) => (kind === "media" ? [] : kind === "content" ? all.filter((t) => CONTENT.includes(t)) : all);
const quote = (t: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`bad table ${t}`);
  return `"${t}"`;
};

/** Builds and stores one archive; records it in `backups`. Returns the backup id. */
export async function createBackup(deps: Deps, o: { kind: BackupKind; trigger: "manual" | "schedule" | "pre_restore"; by: string | null }): Promise<string> {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const id = ulid("bak_");
  mkdirSync(config.BACKUP_DIR, { recursive: true });
  await db.q(`INSERT INTO backups (id, tenant_id, kind, trigger, started_by) VALUES ($1,$2,$3,$4,$5)`, [id, tenant, o.kind, o.trigger, o.by]);
  try {
    const files: Zippable = {};
    const all = await tableOrder(db.q);
    const tables = tablesFor(all, o.kind);
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await db.q(`SELECT * FROM ${quote(t)}`);
      counts[t] = rows.length;
      files[`db/${t}.ndjson`] = strToU8(rows.map((r) => JSON.stringify(r)).join("\n"));
    }
    let mediaFiles = 0;
    if ((o.kind === "full" || o.kind === "media") && existsSync(config.MEDIA_DIR)) {
      for (const f of readdirSync(config.MEDIA_DIR)) {
        const p = path.join(config.MEDIA_DIR, f);
        if (!/^[\w.-]+$/.test(f) || !statSync(p).isFile()) continue;
        files[`media/${f}`] = [readFileSync(p), { level: 0 }];
        mediaFiles++;
      }
    }
    const manifest = { format: 1, id, kind: o.kind, tenant, createdAt: new Date().toISOString(), order: tables, counts, mediaFiles };
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const enc = encrypt(backupKey(deps), zipSync(files, { level: 6 }));
    const file = `${id}.opexbak`;
    writeFileSync(path.join(config.BACKUP_DIR, file), enc, { mode: 0o600 });
    const sha = createHash("sha256").update(enc).digest("hex");
    await db.q(`UPDATE backups SET status = 'done', file = $2, bytes = $3, sha256 = $4, encrypted = true, finished_at = clock_timestamp() WHERE id = $1`, [id, file, enc.length, sha]);
    return id;
  } catch (e) {
    await db.q(`UPDATE backups SET status = 'failed', error = $2, finished_at = clock_timestamp() WHERE id = $1`, [id, (e as Error).message.slice(0, 500)]);
    throw e;
  }
}

export type RestorePlan = { kind: BackupKind; tables: string[]; mediaFiles: number; createdAt: string };

/** Replaces data with the archive's. Media files are written only after the database commit. */
export async function restoreBackup(deps: Deps, enc: Buffer, o: { tables?: "all" | "content"; media: boolean }): Promise<RestorePlan> {
  const { db, config } = deps;
  const files = unzipSync(decrypt(backupKey(deps), enc), { filter: (f) => f.originalSize <= 2 * 1024 * 1024 * 1024 });
  const manifest = JSON.parse(strFromU8(files["manifest.json"] ?? strToU8("{}"))) as { format?: number; order?: string[]; kind?: BackupKind; createdAt?: string; tenant?: string };
  if (manifest.format !== 1 || !Array.isArray(manifest.order)) throw new Error("NOT_A_BACKUP");
  if (manifest.tenant !== config.TENANT) throw new Error("OTHER_TENANT");
  const current = await tableOrder(db.q);
  const wanted = manifest.order.filter((t) => current.includes(t) && !NEVER.has(t) && (o.tables !== "content" || CONTENT.includes(t)));
  if (wanted.length) {
    await db.tx(async (q) => {
      // Children first when deleting, parents first when inserting.
      for (const t of [...wanted].reverse()) await q(`DELETE FROM ${quote(t)}`);
      if (wanted.includes("principals")) await q(`DELETE FROM sessions`);
      for (const t of wanted) {
        const raw = files[`db/${t}.ndjson`];
        if (!raw) continue;
        const rows = strFromU8(raw).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
        for (let i = 0; i < rows.length; i += 200) {
          await q(`INSERT INTO ${quote(t)} SELECT * FROM jsonb_populate_recordset(NULL::${quote(t)}, $1::jsonb)`, [JSON.stringify(rows.slice(i, i + 200))]);
        }
      }
    });
  }
  let mediaFiles = 0;
  if (o.media) {
    mkdirSync(config.MEDIA_DIR, { recursive: true });
    for (const [name, bytes] of Object.entries(files)) {
      if (!name.startsWith("media/")) continue;
      const f = name.slice(6);
      if (!/^[\w.-]+$/.test(f) || f.startsWith(".")) continue; // never a path outside MEDIA_DIR
      writeFileSync(path.join(config.MEDIA_DIR, f), bytes);
      mediaFiles++;
    }
  }
  return { kind: manifest.kind ?? "full", tables: wanted, mediaFiles, createdAt: manifest.createdAt ?? "" };
}

// ── Configuration (stored in site_settings as section "backup"; secrets encrypted) ──
const SECRET_FIELDS = ["password", "secretKey"] as const;

export async function loadBackupConfig(deps: Deps, opts: { reveal: boolean }): Promise<BackupConfigT> {
  const [row] = await deps.db.q<{ data: Record<string, unknown> }>(`SELECT data FROM site_settings WHERE tenant_id = $1 AND section = 'backup'`, [deps.config.TENANT]);
  const parsed = BackupConfig.safeParse(row?.data ?? {});
  const cfg = parsed.success ? parsed.data : BackupConfig.parse({});
  const keys = inquiryKeys(deps.config);
  for (const f of SECRET_FIELDS) {
    const v = cfg.remote[f];
    if (!v) continue;
    if (!opts.reveal) cfg.remote[f] = "••••••";
    else
      try {
        const [, keyId, payload] = String(v).split(":");
        cfg.remote[f] = String(keys.decrypt("settings:backup", keyId!, payload!));
      } catch {
        cfg.remote[f] = null;
      }
  }
  return cfg;
}

/** Saves the configuration; a masked secret ("••••••") keeps the stored one. */
export async function saveBackupConfig(deps: Deps, next: BackupConfigT, by: string) {
  const [row] = await deps.db.q<{ data: Record<string, Record<string, unknown>> }>(`SELECT data FROM site_settings WHERE tenant_id = $1 AND section = 'backup'`, [deps.config.TENANT]);
  const keys = inquiryKeys(deps.config);
  const stored = { ...next, remote: { ...next.remote } } as BackupConfigT & { remote: Record<string, unknown> };
  for (const f of SECRET_FIELDS) {
    const v = next.remote[f];
    if (v === "••••••") stored.remote[f] = (row?.data?.remote?.[f] as string | undefined) ?? null;
    else if (v) {
      const e = keys.encrypt("settings:backup", v);
      stored.remote[f] = `enc:${e.keyId}:${e.payload}`;
    } else stored.remote[f] = null;
  }
  await deps.db.q(
    `INSERT INTO site_settings (tenant_id, section, data, updated_by) VALUES ($1,'backup',$2::jsonb,$3)
     ON CONFLICT (tenant_id, section) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = clock_timestamp()`,
    [deps.config.TENANT, JSON.stringify(stored), by],
  );
}

// ── Remote copies ──
/** Sends one archive to the configured remote. Returns where it went. */
export async function sendRemote(deps: Deps, cfg: BackupConfigT, file: string): Promise<string> {
  const r = cfg.remote;
  const local = path.join(deps.config.BACKUP_DIR, file);
  const dir = (r.path || "/").replace(/\/+$/, "");
  const remotePath = `${dir}/${file}`;
  if (r.type === "none") throw new Error("NO_REMOTE");
  if (r.type === "ftp" || r.type === "ftps") {
    const { Client } = await import("basic-ftp");
    const c = new Client(30_000);
    try {
      await c.access({ host: r.host!, port: r.port ?? 21, user: r.user ?? "anonymous", password: r.password ?? "", secure: r.type === "ftps" });
      await c.ensureDir(dir || "/");
      await c.uploadFrom(local, file);
    } finally {
      c.close();
    }
    return `${r.type}://${r.host}${remotePath}`;
  }
  if (r.type === "sftp") {
    const { default: Sftp } = await import("ssh2-sftp-client");
    const c = new Sftp();
    try {
      await c.connect({ host: r.host!, port: r.port ?? 22, username: r.user!, password: r.password ?? undefined, readyTimeout: 30_000 });
      if (dir && !(await c.exists(dir))) await c.mkdir(dir, true);
      await c.fastPut(local, remotePath);
    } finally {
      await c.end().catch(() => undefined);
    }
    return `sftp://${r.host}${remotePath}`;
  }
  if (r.type === "webdav") {
    const url = `${r.endpoint!.replace(/\/$/, "")}${remotePath}`;
    if (deps.config.isProd) await assertPublicUrl(url);
    const res = await fetch(url, { method: "PUT", body: readFileSync(local), headers: { authorization: `Basic ${Buffer.from(`${r.user ?? ""}:${r.password ?? ""}`).toString("base64")}`, "content-type": "application/octet-stream" }, signal: AbortSignal.timeout(120_000), redirect: "error" });
    if (!res.ok) throw new Error(`WebDAV ${res.status}`);
    return url;
  }
  // S3-compatible (AWS, MinIO, Arvan, Cloudflare R2 …): one signed PUT (AWS Signature V4).
  const endpoint = (r.endpoint || `https://s3.${r.region}.amazonaws.com`).replace(/\/$/, "");
  const key = `${dir.replace(/^\//, "")}${dir ? "/" : ""}${file}`;
  const url = new URL(`${endpoint}/${r.bucket}/${key}`);
  if (deps.config.isProd) await assertPublicUrl(url.toString());
  const body = readFileSync(local);
  const res = await fetch(url, { method: "PUT", body, headers: signS3("PUT", url, body, r.region || "us-east-1", r.accessKey!, r.secretKey!), signal: AbortSignal.timeout(300_000), redirect: "error" });
  if (!res.ok) throw new Error(`S3 ${res.status}`);
  return `s3://${r.bucket}/${key}`;
}

export function signS3(method: string, url: URL, body: Buffer, region: string, accessKey: string, secretKey: string, now = new Date()): Record<string, string> {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const hash = createHash("sha256").update(body).digest("hex");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": hash, "x-amz-date": amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = [method, url.pathname.split("/").map(encodeURIComponent).join("/"), url.searchParams.toString(), ...signed.map((h) => `${h}:${headers[h]}`), "", signed.join(";"), hash].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const h = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
  const sig = createHmac("sha256", h(h(h(h(`AWS4${secretKey}`, day), region), "s3"), "aws4_request")).update(toSign).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${sig}`, "content-type": "application/octet-stream" };
}

/** Deletes the oldest local archives beyond `keep` (manual ones included). */
export async function prune(deps: Deps, keep: number) {
  const old = await deps.db.q<{ id: string; file: string | null }>(`SELECT id, file FROM backups WHERE tenant_id = $1 AND status = 'done' ORDER BY created_at DESC OFFSET $2`, [deps.config.TENANT, keep]);
  for (const b of old) {
    if (b.file && /^bak_[0-9A-Z]{26}\.opexbak$/.test(b.file)) {
      const p = path.join(deps.config.BACKUP_DIR, b.file);
      if (existsSync(p)) unlinkSync(p);
    }
    await deps.db.q(`DELETE FROM backups WHERE id = $1`, [b.id]);
  }
}

/** Is a scheduled backup due? (daily/weekly at the configured hour, server time.) */
export function due(cfg: BackupConfigT, last: Date | null, now = new Date()): boolean {
  if (cfg.schedule === "off") return false;
  if (now.getHours() < cfg.hour) return false;
  const minGap = cfg.schedule === "daily" ? 20 * 3600_000 : 6.5 * 86_400_000;
  return !last || now.getTime() - last.getTime() >= minGap;
}
