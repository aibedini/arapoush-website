/**
 * Operations CLI:
 *   pnpm --filter @arapoush/opex-api cli migrate
 *   pnpm --filter @arapoush/opex-api cli audit:verify [from] [to]
 *   pnpm --filter @arapoush/opex-api cli <command from later phases>
 */
import { loadConfig } from "./config.ts";
import { openDb } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { verifyChain } from "./audit/audit.ts";
import { COMMANDS } from "./commands.ts";

const [cmd, ...args] = process.argv.slice(2);
// The installer runs this before any configuration exists (it creates the secrets), so it needs
// neither the config nor the database.
if (cmd === "keys:generate") {
  await COMMANDS[cmd]!(undefined as never, args);
  process.exit(0);
}
const config = loadConfig();
const db = await openDb({ url: config.DATABASE_URL, dataDir: config.DATA_DIR });
try {
  await migrate(db, (m) => console.log(m));
  if (cmd === "migrate") console.log("migrations up to date");
  else if (cmd === "audit:verify") {
    const r = await verifyChain(db, config.TENANT, args[0] ? Number(args[0]) : 1, args[1] ? Number(args[1]) : undefined);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 2;
  } else if (cmd && COMMANDS[cmd]) await COMMANDS[cmd]!({ config, db }, args);
  else {
    console.log(`Commands: migrate, audit:verify [from] [to], ${Object.keys(COMMANDS).join(", ")}`);
    process.exitCode = cmd ? 1 : 0;
  }
} finally {
  await db.close();
}
