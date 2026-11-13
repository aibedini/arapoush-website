import { createReadStream, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Deps } from "../app.ts";
import { audit, auditNow } from "../audit/audit.ts";
import { requireOperator, requireStepUp } from "../auth/guards.ts";
import { actorOf } from "../auth/principal.ts";
import { badRequest, conflict, notFound } from "../http/problem.ts";
import { BACKUPS } from "./contract.ts";
import { createBackup, due, loadBackupConfig, prune, restoreBackup, saveBackupConfig, sendRemote } from "./service.ts";
import type { Job } from "../workers.ts";

let running = false;

/** Makes a backup, copies it to the remote (if any) and prunes old ones. */
async function runBackup(deps: Deps, o: { kind: Parameters<typeof createBackup>[1]["kind"]; trigger: "manual" | "schedule"; by: string | null; remote: boolean }) {
  if (running) throw conflict("BACKUP_RUNNING", "Another backup is still running");
  running = true;
  try {
    const id = await createBackup(deps, { kind: o.kind, trigger: o.trigger, by: o.by });
    const cfg = await loadBackupConfig(deps, { reveal: true });
    if (o.remote && cfg.remote.type !== "none") {
      const [b] = await deps.db.q<{ file: string }>(`SELECT file FROM backups WHERE id = $1`, [id]);
      let entry: { at: string; to: string | null; ok: boolean; error: string | null };
      try {
        entry = { at: new Date().toISOString(), to: await sendRemote(deps, cfg, b!.file), ok: true, error: null };
      } catch (e) {
        entry = { at: new Date().toISOString(), to: null, ok: false, error: (e as Error).message.slice(0, 300) };
      }
      await deps.db.q(`UPDATE backups SET remote = remote || $2::jsonb WHERE id = $1`, [id, JSON.stringify([entry])]);
    }
    await prune(deps, cfg.keep);
    return id;
  } finally {
    running = false;
  }
}

/** S4: backups, restore, schedule and remote copies (FTP, FTPS, SFTP, S3-compatible, WebDAV). */
export async function backupsModule(app: FastifyInstance, deps: Deps) {
  const { db, config } = deps;
  const tenant = config.TENANT;
  const admin = [requireOperator(deps, "super_admin"), requireStepUp(deps)];

  app.get("/v1/manage/backups", { preHandler: requireOperator(deps, "operator") }, async () =>
    db.q(`SELECT id, kind, trigger, status, bytes::float8 AS bytes, sha256, encrypted, remote, error, started_by, created_at, finished_at FROM backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenant]),
  );

  app.post("/v1/manage/backups", { preHandler: admin, config: { rateLimit: { max: 6, timeWindow: "1 hour" } } }, async (req) => {
    const { kind, remote } = BACKUPS.create.body.parse(req.body ?? {});
    const id = await runBackup(deps, { kind, trigger: "manual", by: req.principal!.id, remote });
    await auditNow(db, tenant, { action: "backup.create", actor: actorOf(req), request: req.info, resource: { type: "backup", id, kind } });
    return { id };
  });

  app.get("/v1/manage/backups/:id/download", { preHandler: admin }, async (req, reply) => {
    const { id } = BACKUPS.download.params.parse(req.params);
    const [b] = await db.q<{ file: string | null }>(`SELECT file FROM backups WHERE id = $1 AND tenant_id = $2 AND status = 'done'`, [id, tenant]);
    const p = b?.file ? path.join(config.BACKUP_DIR, b.file) : null;
    if (!p || !existsSync(p)) throw notFound("Backup");
    await auditNow(db, tenant, { action: "backup.download", actor: actorOf(req), request: req.info, resource: { type: "backup", id } });
    reply.header("Content-Type", "application/octet-stream").header("Content-Disposition", `attachment; filename="${b!.file}"`).header("X-Content-Type-Options", "nosniff");
    return reply.send(createReadStream(p));
  });

  app.delete("/v1/manage/backups/:id", { preHandler: admin }, async (req) => {
    const { id } = BACKUPS.remove.params.parse(req.params);
    await db.tx(async (q) => {
      const [b] = await q<{ file: string | null }>(`DELETE FROM backups WHERE id = $1 AND tenant_id = $2 RETURNING file`, [id, tenant]);
      if (!b) throw notFound("Backup");
      if (b.file && /^bak_[0-9A-Z]{26}\.opexbak$/.test(b.file) && existsSync(path.join(config.BACKUP_DIR, b.file))) unlinkSync(path.join(config.BACKUP_DIR, b.file));
      await audit(q, tenant, { action: "backup.delete", actor: actorOf(req), request: req.info, resource: { type: "backup", id } });
    });
    return { ok: true };
  });

  // Restore from a stored backup (JSON body) or an uploaded archive (?scope=&media=&confirm=RESTORE, octet-stream body).
  app.post("/v1/manage/backups/restore", { preHandler: admin, bodyLimit: 512 * 1024 * 1024, config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (req) => {
    const upload = Buffer.isBuffer(req.body);
    const body = BACKUPS.restore.body.parse(upload ? { ...(req.query as Record<string, string>), media: (req.query as Record<string, string>).media !== "false" } : req.body);
    let enc: Buffer;
    let from: string;
    if (body.id) {
      const [b] = await db.q<{ file: string | null }>(`SELECT file FROM backups WHERE id = $1 AND tenant_id = $2 AND status = 'done'`, [body.id, tenant]);
      const p = b?.file ? path.join(config.BACKUP_DIR, b.file) : null;
      if (!p || !existsSync(p)) throw notFound("Backup");
      enc = readFileSync(p);
      from = body.id;
    } else if (upload) {
      enc = req.body as Buffer;
      from = "upload";
    } else throw badRequest("NOT_A_BACKUP", "Name a backup or upload one");
    // A safety net first: whatever happens, the state before the restore can be restored.
    const safety = await createBackup(deps, { kind: "full", trigger: "pre_restore", by: req.principal!.id });
    let plan;
    try {
      plan = await restoreBackup(deps, enc, { tables: body.scope, media: body.media });
    } catch (e) {
      const m = (e as Error).message;
      if (["NOT_A_BACKUP", "WRONG_KEY_OR_DAMAGED", "OTHER_TENANT"].includes(m)) throw badRequest(m === "OTHER_TENANT" ? "OTHER_TENANT" : "NOT_A_BACKUP", m);
      throw e;
    }
    await auditNow(db, tenant, { action: "backup.restore", actor: actorOf(req), request: req.info, resource: { type: "backup", id: from, safety, scope: body.scope, tables: plan.tables.length, media: plan.mediaFiles } });
    return { safety, tables: plan.tables, mediaFiles: plan.mediaFiles, from };
  });

  app.get("/v1/manage/backups/config", { preHandler: requireOperator(deps, "operator") }, async () => loadBackupConfig(deps, { reveal: false }));

  app.put("/v1/manage/backups/config", { preHandler: admin }, async (req) => {
    const cfg = BACKUPS.putConfig.body.parse(req.body);
    await saveBackupConfig(deps, cfg, req.principal!.id);
    const masked = { ...cfg, remote: { ...cfg.remote, password: cfg.remote.password ? "••••••" : null, secretKey: cfg.remote.secretKey ? "••••••" : null } };
    await auditNow(db, tenant, { action: "backup.config", actor: actorOf(req), request: req.info, resource: { type: "settings", id: "backup", config: masked } });
    return { ok: true };
  });

  app.post("/v1/manage/backups/config/test", { preHandler: admin, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async () => {
    const cfg = await loadBackupConfig(deps, { reveal: true });
    const file = `opex-test-${Date.now()}.txt`;
    const local = path.join(config.BACKUP_DIR, file);
    try {
      writeFileSync(local, "OPEX backup connection test\n", { mode: 0o600 });
      return { ok: true, to: await sendRemote(deps, cfg, file), error: null };
    } catch (e) {
      return { ok: false, to: null, error: (e as Error).message.slice(0, 300) };
    } finally {
      if (existsSync(local)) unlinkSync(local);
    }
  });
}

/** Scheduled backups (checks every 10 minutes). */
export const scheduledBackup: Job = {
  name: "backup.schedule",
  everyMs: 10 * 60_000,
  run: async (deps: Deps, log: FastifyBaseLogger) => {
    const cfg = await loadBackupConfig(deps, { reveal: false });
    if (cfg.schedule === "off") return;
    const [last] = await deps.db.q<{ created_at: Date }>(`SELECT created_at FROM backups WHERE tenant_id = $1 AND trigger = 'schedule' AND status = 'done' ORDER BY created_at DESC LIMIT 1`, [deps.config.TENANT]);
    if (!due(cfg, last ? new Date(last.created_at) : null)) return;
    const id = await runBackup(deps, { kind: cfg.kind, trigger: "schedule", by: null, remote: true });
    log.info({ id }, "scheduled backup done");
  },
};
