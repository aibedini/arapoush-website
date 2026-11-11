import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./index.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Applies pending SQL migrations in file-name order, each in its own transaction. */
export async function migrate(db: Db, log: (m: string) => void = () => undefined): Promise<string[]> {
  await db.q(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
  const done = new Set((await db.q<{ name: string }>(`SELECT name FROM schema_migrations`)).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    await db.tx(async (q) => {
      // Whole file as one simple-protocol batch (DO blocks, functions, triggers).
      for (const stmt of splitSql(sql)) await q(stmt);
      await q(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    });
    log(`migrated ${file}`);
    applied.push(file);
  }
  return applied;
}

/** Splits on semicolons outside $$ bodies, quotes and comments. */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let dollar = false;
  let quote = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (!dollar && !quote && c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      cur += "\n";
      continue;
    }
    if (!quote && c === "$" && sql[i + 1] === "$") {
      dollar = !dollar;
      cur += "$$";
      i++;
      continue;
    }
    if (!dollar && c === "'") quote = !quote;
    if (!dollar && !quote && c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
