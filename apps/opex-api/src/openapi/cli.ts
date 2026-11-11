import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullSpec, partnerSpec, siteSpec } from "./specs.ts";

/**
 * `pnpm docs:api` writes docs/api/*.openapi.json from the route contracts.
 * `pnpm docs:api:check` fails when the committed files differ from what the code produces (drift).
 */
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/api");
const SERVER = "https://opex.arapoush.com";
const files: Record<string, unknown> = {
  "opex.openapi.json": fullSpec(SERVER),
  "partner.openapi.json": partnerSpec(SERVER),
  "site.openapi.json": siteSpec("https://arapoush.com"),
};

const check = process.argv.includes("--check");
let drift = 0;
mkdirSync(out, { recursive: true });
for (const [name, spec] of Object.entries(files)) {
  const text = JSON.stringify(spec, null, 2) + "\n";
  const file = path.join(out, name);
  if (check) {
    let current = "";
    try {
      current = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    } catch {}
    if (current !== text) {
      drift++;
      console.error(`docs/api/${name} is out of date: run pnpm docs:api and commit the result`);
    }
  } else {
    writeFileSync(file, text);
    console.log(`wrote docs/api/${name} (${Object.keys((spec as { paths: object }).paths).length} paths)`);
  }
}
if (drift) process.exitCode = 1;
else if (check) console.log("docs/api is up to date");
