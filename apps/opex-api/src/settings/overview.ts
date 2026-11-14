import os from "node:os";
import path from "node:path";
import { connect } from "node:net";
import { existsSync, readdirSync, readFileSync, statfsSync, statSync } from "node:fs";
import type { Deps } from "../app.ts";
import type { Row } from "../db/index.ts";
import { loadBackupConfig } from "../backups/service.ts";
import { crawlBase, headerStatus, loadSettings, sslStatus } from "./service.ts";

/**
 * System overview (Settings → Overview): health of every service, memory, disk and how much each
 * part of the platform stores, queues, and a list of best-practice checks with a score. Read-only;
 * computed on request and cached briefly, since it walks the media folder and calls the live site.
 */

type Level = "ok" | "warn" | "fail";
export type Check = { id: string; area: "security" | "reliability" | "performance" | "seo" | "operations"; level: Level; value: string | null };
export type Service = { id: string; ok: boolean; latencyMs: number | null; detail: string | null };

const MB = 1024 * 1024;

function meminfo() {
  const m: Record<string, number> = {};
  try {
    for (const line of readFileSync("/proc/meminfo", "utf8").split("\n")) {
      const [k, v] = line.split(":");
      if (k && v) m[k.trim()] = Number.parseInt(v, 10) * 1024;
    }
  } catch {
    // Not Linux: fall back to what Node knows.
  }
  return {
    totalBytes: m.MemTotal ?? os.totalmem(),
    availableBytes: m.MemAvailable ?? os.freemem(),
    swapTotalBytes: m.SwapTotal ?? 0,
    swapFreeBytes: m.SwapFree ?? 0,
  };
}

function disk(dir: string) {
  try {
    const s = statfsSync(dir);
    return { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

/** Bytes and file count under a folder (bounded, so a huge tree cannot stall the request). */
function dirSize(dir: string, limit = 50_000) {
  let bytes = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length && files < limit) {
    const d = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(d, n);
      try {
        const st = statSync(p);
        if (st.isDirectory()) stack.push(p);
        else {
          bytes += st.size;
          files++;
        }
      } catch {
        // Vanished while walking.
      }
    }
  }
  return { bytes, files };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value: T | null; error: string | null }> {
  const t = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: Math.round(performance.now() - t), value, error: null };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t), value: null, error: (e as Error).message.slice(0, 200) };
  }
}

function clamPing(hostPort: string) {
  const [host, port] = hostPort.split(":");
  return new Promise<void>((resolve, reject) => {
    const sock = connect({ host, port: Number(port ?? 3310) });
    let reply = "";
    sock.setTimeout(3000, () => sock.destroy(new Error("timeout")));
    sock.on("connect", () => sock.write("zPING\0"));
    sock.on("data", (b) => {
      reply += b.toString();
      sock.end();
    });
    sock.on("error", reject);
    sock.on("close", () => (reply.startsWith("PONG") ? resolve() : reject(new Error(reply.replace(/\0/g, "").trim() || "no answer"))));
  });
}

const ago = (d: Date | string | null | undefined) => (d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : null);

let cache: { at: number; value: unknown } | null = null;

export async function systemOverview(deps: Deps, fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 20_000) return cache.value;
  const { db, config } = deps;
  const tenant = config.TENANT;
  const q = db.q;
  const one = async <T extends Row>(sql: string, params: unknown[] = []) => ((await q<T>(sql, params))[0] ?? ({} as T));

  // ── Services ──
  const site = crawlBase(config);
  const [dbPing, sitePing, clam, ssl, headers] = await Promise.all([
    timed(() => q("SELECT 1")),
    timed(async () => {
      const r = await fetch(`${site}/fa`, { signal: AbortSignal.timeout(6000), redirect: "manual" });
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
      return r.status;
    }),
    config.CLAMAV ? timed(() => clamPing(config.CLAMAV!)) : Promise.resolve(null),
    sslStatus(config.SITE_URL),
    headerStatus(`${site}/fa`),
  ]);
  const render = await one<{ pending: number; failed: number; last_claim: Date | null; last_done: Date | null }>(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'failed' AND created_at > clock_timestamp() - interval '7 days')::int AS failed,
            max(claimed_at) AS last_claim, max(finished_at) FILTER (WHERE status = 'done') AS last_done
       FROM render_jobs WHERE tenant_id = $1`,
    [tenant],
  );
  const services: Service[] = [
    { id: "database", ok: dbPing.ok, latencyMs: dbPing.ms, detail: dbPing.error ?? db.kind },
    { id: "website", ok: sitePing.ok, latencyMs: sitePing.ms, detail: sitePing.error },
    { id: "scanner", ok: clam ? clam.ok : false, latencyMs: clam?.ms ?? null, detail: clam ? clam.error : "not configured" },
    { id: "mail", ok: !!config.SMTP_URL, latencyMs: null, detail: config.SMTP_URL ? null : "SMTP_URL not set" },
    // A job waiting more than 10 minutes means nothing is claiming them.
    { id: "renderer", ok: !(render.pending > 0 && (ago(render.last_claim) ?? 99) > 1 / 6), latencyMs: null, detail: render.pending ? `${render.pending} waiting` : null },
  ];

  // ── Host ──
  const mem = meminfo();
  const proc = process.memoryUsage();
  const disks = [
    { id: "data", path: config.DATA_DIR, ...disk(config.DATA_DIR) },
    { id: "backups", path: config.BACKUP_DIR, ...disk(config.BACKUP_DIR) },
  ].filter((d) => d.totalBytes !== undefined) as { id: string; path: string; totalBytes: number; freeBytes: number }[];

  // ── Storage (what each part keeps) ──
  const dbSize = db.kind === "pg" ? Number((await one<{ b: string }>(`SELECT pg_database_size(current_database())::text AS b`)).b ?? 0) : dirSize(path.resolve(config.DATA_DIR, "pglite")).bytes;
  const media = existsSync(config.MEDIA_DIR) ? dirSize(config.MEDIA_DIR) : { bytes: 0, files: 0 };
  const backupFiles = existsSync(config.BACKUP_DIR) ? dirSize(config.BACKUP_DIR, 5000) : { bytes: 0, files: 0 };
  const audit = await one<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1`, [tenant]);

  // ── Activity and queues ──
  const content = await one<{ entries: number; published: number; drafts: number }>(
    `SELECT count(*)::int AS entries, count(*) FILTER (WHERE published_revision_id IS NOT NULL)::int AS published,
            count(*) FILTER (WHERE draft_revision_id IS NOT NULL AND draft_revision_id IS DISTINCT FROM published_revision_id)::int AS drafts
       FROM entries WHERE tenant_id = $1`,
    [tenant],
  );
  const assets = await one<{ n: number; bytes: string }>(`SELECT count(*)::int AS n, coalesce(sum(bytes), 0)::text AS bytes FROM assets WHERE tenant_id = $1`, [tenant]);
  const tickets = await one<{ open: number; week: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('new','open','pending','on_hold'))::int AS open,
            count(*) FILTER (WHERE created_at > clock_timestamp() - interval '7 days')::int AS week
       FROM tickets WHERE tenant_id = $1`,
    [tenant],
  );
  const mail = await one<{ pending: number; dead: number }>(`SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*) FILTER (WHERE status = 'dead')::int AS dead FROM email_outbox WHERE tenant_id = $1`, [tenant]);
  const hooks = await one<{ pending: number; dead: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('pending','failed'))::int AS pending, count(*) FILTER (WHERE status = 'dead' AND created_at > clock_timestamp() - interval '7 days')::int AS dead FROM webhook_deliveries WHERE tenant_id = $1`,
    [tenant],
  );
  const ops = await one<{ total: number; admins: number; no_mfa: number; locked: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE role = 'super_admin')::int AS admins,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM credentials c WHERE c.principal_id = p.id AND c.kind = 'totp' AND c.confirmed))::int AS no_mfa,
            count(*) FILTER (WHERE locked_until > clock_timestamp())::int AS locked
       FROM principals p WHERE tenant_id = $1 AND kind = 'operator' AND status = 'active'`,
    [tenant],
  );
  const lastBackup = await one<{ created_at: Date | null; bytes: string | null; remote: { ok: boolean }[] | null }>(
    `SELECT created_at, bytes::text AS bytes, remote FROM backups WHERE tenant_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT 1`,
    [tenant],
  );
  const seo = await one<{ score: number | null; created_at: Date | null }>(`SELECT score, created_at FROM seo_reports WHERE tenant_id = $1 AND status = 'done' ORDER BY created_at DESC LIMIT 1`, [tenant]);
  const backupCfg = await loadBackupConfig(deps, { reveal: false });
  const { settings } = await loadSettings(q, tenant);

  // ── Best-practice checks ──
  const C = (id: string, area: Check["area"], level: Level, value: string | null = null): Check => ({ id, area, level, value });
  const lvl = (good: boolean, warn = false): Level => (good ? "ok" : warn ? "warn" : "fail");
  const memPct = mem.availableBytes / mem.totalBytes;
  const dataDisk = disks.find((d) => d.id === "data");
  const diskPct = dataDisk ? dataDisk.freeBytes / dataDisk.totalBytes : 1;
  const backupAge = ago(lastBackup.created_at);
  const missingHeaders = headers.filter((h) => !h.present).map((h) => h.name);
  const openConsole = config.consoleCidrs.length === 0 || config.consoleCidrs.some((c) => c === "0.0.0.0/0" || c === "::/0");
  const checks: Check[] = [
    C("ssl.valid", "security", ssl.error || !ssl.https ? "fail" : (ssl.daysLeft ?? 0) < 14 ? "warn" : "ok", ssl.daysLeft === null ? null : String(ssl.daysLeft)),
    C("headers.security", "security", missingHeaders.length === 0 ? "ok" : missingHeaders.length <= 2 ? "warn" : "fail", missingHeaders.join(", ") || null),
    C("console.allowlist", "security", openConsole ? "warn" : "ok", config.consoleCidrs.join(" ") || null),
    C("operators.mfa", "security", lvl(ops.no_mfa === 0, true), String(ops.no_mfa)),
    C("operators.admins", "security", lvl(ops.admins >= 1 && ops.admins <= 3, ops.admins > 3), String(ops.admins)),
    C("forms.turnstile", "security", config.TURNSTILE_SECRET ? "ok" : "warn"),
    C("uploads.scanner", "security", clam?.ok ? "ok" : config.CLAMAV ? "fail" : "warn"),
    C("backups.recent", "reliability", backupAge === null ? "fail" : backupAge > 48 ? "warn" : "ok", backupAge === null ? null : String(Math.round(backupAge))),
    C("backups.schedule", "reliability", backupCfg.schedule === "off" ? "warn" : "ok", backupCfg.schedule),
    C("backups.offsite", "reliability", backupCfg.remote.type === "none" ? "warn" : lastBackup.remote?.at(-1)?.ok === false ? "fail" : "ok", backupCfg.remote.type),
    C("backups.key", "reliability", config.BACKUP_KEY ? "ok" : "warn"),
    C("audit.archive", "reliability", config.AUDIT_ARCHIVE_DIR ? "ok" : "warn"),
    C("mail.smtp", "operations", config.SMTP_URL ? "ok" : "warn"),
    C("mail.queue", "operations", mail.dead > 0 ? "fail" : mail.pending > 20 ? "warn" : "ok", `${mail.pending}/${mail.dead}`),
    C("webhooks.queue", "operations", hooks.dead > 0 ? "fail" : hooks.pending > 20 ? "warn" : "ok", `${hooks.pending}/${hooks.dead}`),
    C("render.queue", "operations", render.failed > 0 ? "warn" : "ok", `${render.pending}/${render.failed}`),
    C("memory.available", "performance", memPct < 0.08 ? "fail" : memPct < 0.15 ? "warn" : "ok", String(Math.round(memPct * 100))),
    C("memory.swap", "performance", mem.swapTotalBytes > 0 ? "ok" : mem.totalBytes < 6 * 1024 * MB ? "warn" : "ok", String(Math.round(mem.swapTotalBytes / MB))),
    C("disk.free", "performance", diskPct < 0.1 ? "fail" : diskPct < 0.2 ? "warn" : "ok", String(Math.round(diskPct * 100))),
    C("site.response", "performance", !sitePing.ok ? "fail" : sitePing.ms > 1500 ? "warn" : "ok", String(sitePing.ms)),
    C("seo.indexing", "seo", settings.seo.indexing ? "ok" : "warn"),
    C("seo.score", "seo", seo.score === null ? "warn" : seo.score >= settings.seo.minScore ? "ok" : "warn", seo.score === null ? null : String(seo.score)),
    C("seo.verification", "seo", settings.analytics.verification.google || settings.analytics.verification.bing ? "ok" : "warn"),
    C("analytics.installed", "seo", settings.analytics.ga4 || settings.analytics.gtm || settings.analytics.clarity || settings.analytics.matomo || settings.analytics.yandex ? "ok" : "warn"),
    C("security.contact", "security", settings.security.contactEmail ? "ok" : "warn"),
  ];
  const weight = { ok: 1, warn: 0.5, fail: 0 } as const;
  const score = Math.round((checks.reduce((s, c) => s + weight[c.level], 0) / checks.length) * 100);

  const value = {
    generatedAt: new Date().toISOString(),
    score,
    services,
    host: {
      memTotalBytes: mem.totalBytes,
      memAvailableBytes: mem.availableBytes,
      swapTotalBytes: mem.swapTotalBytes,
      swapFreeBytes: mem.swapFreeBytes,
      cpus: os.cpus().length,
      load: os.loadavg().map((x) => Math.round(x * 100) / 100),
      uptimeSeconds: Math.round(os.uptime()),
      apiRssBytes: proc.rss,
      apiUptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    },
    disks,
    storage: {
      databaseBytes: dbSize,
      mediaBytes: media.bytes,
      mediaFiles: media.files,
      backupsBytes: backupFiles.bytes,
      backupFiles: backupFiles.files,
      auditEvents: audit.n ?? 0,
    },
    activity: {
      entries: content.entries ?? 0,
      published: content.published ?? 0,
      drafts: content.drafts ?? 0,
      assets: assets.n ?? 0,
      assetBytes: Number(assets.bytes ?? 0),
      ticketsOpen: tickets.open ?? 0,
      ticketsWeek: tickets.week ?? 0,
      operators: ops.total ?? 0,
      lockedOperators: ops.locked ?? 0,
      lastBackupAt: lastBackup.created_at ? new Date(lastBackup.created_at).toISOString() : null,
      lastBackupBytes: lastBackup.bytes ? Number(lastBackup.bytes) : null,
      lastSeoAt: seo.created_at ? new Date(seo.created_at).toISOString() : null,
      lastSeoScore: seo.score ?? null,
      lastRenderAt: render.last_done ? new Date(render.last_done).toISOString() : null,
    },
    ssl,
    checks,
  };
  cache = { at: Date.now(), value };
  return value;
}
