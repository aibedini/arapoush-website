import { loadConfig } from "./config.ts";
import { openDb } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { buildApp } from "./app.ts";
import { MODULES } from "./modules.ts";
import { startWorkers } from "./workers.ts";

const config = loadConfig();
const db = await openDb({ url: config.DATABASE_URL, dataDir: config.DATA_DIR });
await migrate(db, (m) => console.log(m));
const app = await buildApp({ config, db }, MODULES);
const stopWorkers = startWorkers({ config, db }, app.log);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  stopWorkers();
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
