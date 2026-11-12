import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fullSpec, partnerSpec, siteSpec } from "./specs.ts";
import { errorCatalogue, postmanCollection, postmanEnvironment } from "./artifacts.ts";

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
  "errors.md": errorCatalogue(),
  "postman/opex.postman_collection.json": postmanCollection(),
  "postman/local.postman_environment.json": postmanEnvironment("OPEX local", "http://localhost:4000", "http://localhost:3210"),
  "postman/staging.postman_environment.json": postmanEnvironment("OPEX staging", "https://opex.staging.example.com", "https://staging.example.com"),
};

const check = process.argv.includes("--check");
let drift = 0;
mkdirSync(path.join(out, "postman"), { recursive: true });
for (const [name, spec] of Object.entries(files)) {
  const text = typeof spec === "string" ? spec : JSON.stringify(spec, null, 2) + "\n";
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
    console.log(`wrote docs/api/${name}`);
  }
}
if (drift) process.exitCode = 1;
else if (check) console.log("docs/api is up to date");
