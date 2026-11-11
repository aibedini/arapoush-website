import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Minimal database port: parameterised SQL only (no string concatenation of values anywhere),
 * transactions, and one implementation for PostgreSQL (production) and one for embedded PGlite
 * (development and tests: the same PostgreSQL engine compiled to WebAssembly, so SQL, triggers and
 * locks behave identically).
 */
export type Row = Record<string, unknown>;
export type Q = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
export type Db = {
  q: Q;
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "pg" | "pglite";
};

export async function openDb(opts: { url?: string; dataDir?: string; memory?: boolean }): Promise<Db> {
  if (opts.url) return openPg(opts.url);
  const { PGlite } = await import("@electric-sql/pglite");
  let dir: string | undefined;
  if (!opts.memory) {
    dir = path.resolve(opts.dataDir ?? "./data", "pglite");
    mkdirSync(dir, { recursive: true });
  }
  const db = new PGlite(dir);
  await db.waitReady;
  const q: Q = async (sql, params = []) => (await db.query(sql, params as never[])).rows as never;
  // PGlite runs on one connection: serialise transactions so they never interleave.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    kind: "pglite",
    q,
    tx(fn) {
      const run = chain.then(() => db.transaction(async (t) => fn(async (sql, params = []) => (await t.query(sql, params as never[])).rows as never)));
      chain = run.catch(() => undefined);
      return run;
    },
    close: () => db.close(),
  };
}

async function openPg(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000, statement_timeout: 15_000 } as never);
  const q: Q = async (sql, params = []) => (await pool.query(sql, params as unknown[])).rows as never;
  return {
    kind: "pg",
    q,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn(async (sql, params = []) => (await c.query(sql, params as unknown[])).rows as never);
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}
