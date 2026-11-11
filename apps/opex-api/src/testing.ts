import { loadConfig } from "./config.ts";
import { openDb } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { buildApp } from "./app.ts";
import { MODULES } from "./modules.ts";

/** A fresh in-memory OPEX (PGlite, all migrations) for tests. */
export async function testApp(env: Record<string, string> = {}) {
  const config = loadConfig({ NODE_ENV: "test", ...env } as NodeJS.ProcessEnv);
  const db = await openDb({ memory: true });
  await migrate(db);
  const app = await buildApp({ config, db }, MODULES);
  return { app, db, config, close: async () => (await app.close(), await db.close()) };
}
