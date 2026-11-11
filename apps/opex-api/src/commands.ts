import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import type { Deps } from "./app.ts";
import { createOperator } from "./auth/routes.ts";
import { seedContent } from "./content/seed.ts";
import { exportArchive, verifyArchive } from "./audit/archive.ts";
import { auditNow, SYSTEM_REQUEST } from "./audit/audit.ts";
import { enqueueWebhook } from "./webhooks/outbox.ts";

const b64 = (n: number) => randomBytes(n).toString("base64url");

/** CLI commands (see cli.ts and docs/opex/runbooks). */
export const COMMANDS: Record<string, (deps: Deps, args: string[]) => Promise<void>> = {
  seed: async (deps) => console.log(`imported: ${(await seedContent(deps)).join(", ") || "nothing (all entries exist)"}`),

  /** create-operator <email> <display name> <role> — the password is read from OPEX_NEW_PASSWORD. */
  "create-operator": async (deps, [email, name, role = "super_admin"]) => {
    const pw = process.env.OPEX_NEW_PASSWORD;
    if (!email || !name || !pw) throw new Error("Usage: OPEX_NEW_PASSWORD=… cli create-operator <email> <display name> [role]");
    const id = await createOperator(deps, email, name, role, pw);
    console.log(`operator ${id} created; sign in to the console to set up the authenticator`);
  },

  /** Prints fresh secrets for a new install or a rotation (docs/opex/runbooks/key-rotation.md). Nothing is stored. */
  "keys:generate": async () => {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = { ...(await exportJWK(privateKey)), kid: `opex-${new Date().toISOString().slice(0, 10)}-${b64(3)}`, alg: "ES256", use: "sig" };
    console.log(`OPEX_JWT_PRIVATE_JWK='${JSON.stringify(jwk)}'`);
    console.log(`SESSION_SECRET=${b64(48)}`);
    console.log(`DELIVERY_TOKEN=${b64(32)}`);
    console.log(`SITE_WEBHOOK_SECRET=${b64(32)}`);
    console.log(`INQUIRY_KEY=${randomBytes(32).toString("base64")}`);
    console.log(`METRICS_TOKEN=${b64(32)}`);
  },

  /** Writes the audit rows since the last archive to AUDIT_ARCHIVE_DIR (or the given directory). */
  "audit:archive": async (deps, [dir]) => {
    const target = dir ?? deps.config.AUDIT_ARCHIVE_DIR;
    if (!target) throw new Error("Set AUDIT_ARCHIVE_DIR or pass a directory");
    const m = await exportArchive(deps, target, 0);
    console.log(m ? `archived ${m.count} rows (${m.from}–${m.to}) → ${m.file}` : "nothing new to archive");
  },

  /**
   * audit:verify-archive <dir> <jwks-url-or-file>: checks every archive file (signature, digest, links)
   * and that the database still holds the same hashes at each archived range end.
   */
  "audit:verify-archive": async (deps, [dir, jwksSrc]) => {
    if (!dir || !jwksSrc) throw new Error("Usage: cli audit:verify-archive <dir> <jwks url or file>");
    const jwks = (jwksSrc.startsWith("http") ? await (await fetch(jwksSrc)).json() : JSON.parse((await import("node:fs")).readFileSync(jwksSrc, "utf8"))) as { keys: JWK[] };
    let bad = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
      const r = await verifyArchive(path.join(dir, f), jwks);
      let db = "";
      if (r.ok && r.manifest) {
        const [row] = await deps.db.q<{ hash: string }>(`SELECT hash FROM audit_events WHERE tenant_id = $1 AND seq = $2`, [deps.config.TENANT, r.manifest.to]);
        db = row?.hash === r.manifest.last_hash ? "db matches" : "DATABASE DIFFERS FROM ARCHIVE";
        if (row?.hash !== r.manifest.last_hash) bad++;
      } else bad++;
      console.log(`${f}: ${r.ok ? "ok" : `FAILED (${r.reason})`}${db ? `, ${db}` : ""}`);
    }
    if (bad) process.exitCode = 2;
  },

  /** Asks the website to refresh every page from OPEX (after a deploy or a restore). */
  "site:revalidate": async ({ db, config }) => {
    await db.tx((q) => enqueueWebhook(q, config.TENANT, "site", "content.published", { all: true, reason: "manual" }));
    await auditNow(db, config.TENANT, { action: "site.revalidate", actor: { kind: "system", id: "cli", display: "CLI" }, request: SYSTEM_REQUEST });
    console.log("queued: the website refreshes on the next webhook delivery");
  },
};
