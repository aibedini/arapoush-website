import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testApp } from "../testing.ts";
import { CONTRACTS } from "./registry.ts";
import { fullSpec, partnerSpec, siteSpec } from "./specs.ts";
import { SITE } from "./site.ts";
import { errorCatalogue, postmanCollection } from "./artifacts.ts";

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/api");

test("every registered route has exactly one contract, and every contract a route", async () => {
  const t = await testApp({ RENDER_TOKEN: "test-render-token-0123456789abcdef", METRICS_TOKEN: "test-metrics-token-0123456789abcdef" });
  try {
    const served = new Set(t.app.routeList.map((r) => `${r.method} ${r.url}`));
    const documented = CONTRACTS.map((c) => `${c.method} ${c.path}`);
    const dup = documented.filter((k, i) => documented.indexOf(k) !== i);
    assert.deepEqual(dup, [], "a route is documented twice");
    assert.deepEqual([...served].filter((k) => !documented.includes(k)).sort(), [], "routes without a contract (add one in the module's contract.ts)");
    assert.deepEqual(documented.filter((k) => !served.has(k)).sort(), [], "contracts without a route");
    assert.equal(new Set(CONTRACTS.map((c) => c.id)).size, CONTRACTS.length, "operationIds are unique");
  } finally {
    await t.close();
  }
});

test("the committed OpenAPI files match the contracts (run pnpm docs:api)", () => {
  const read = (n: string) => readFileSync(path.join(docs, n), "utf8").replace(/\r\n/g, "\n");
  assert.equal(read("opex.openapi.json"), JSON.stringify(fullSpec("https://opex.arapoush.com"), null, 2) + "\n");
  assert.equal(read("partner.openapi.json"), JSON.stringify(partnerSpec("https://opex.arapoush.com"), null, 2) + "\n");
  assert.equal(read("site.openapi.json"), JSON.stringify(siteSpec("https://arapoush.com"), null, 2) + "\n");
  assert.equal(read("errors.md"), errorCatalogue());
  assert.equal(read("postman/opex.postman_collection.json"), JSON.stringify(postmanCollection(), null, 2) + "\n");
});

test("the partner view exposes no internal routes", () => {
  const paths = Object.keys((partnerSpec("https://x") as { paths: object }).paths);
  assert.ok(paths.length > 10);
  for (const p of paths) assert.ok(/^\/(v1\/partner|oauth|\.well-known|docs\/partner)/.test(p), `internal route in the partner spec: ${p}`);
});

test("every website route file has a contract (apps/web/app)", () => {
  const app = path.resolve(docs, "../../apps/web/app");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name === "route.ts" || ((d.name === "sitemap.ts" || d.name === "robots.ts") && dir === app)) found.push(path.relative(path.resolve(docs, "../.."), p).split(path.sep).join("/"));
    }
  };
  walk(app);
  const documented = Object.values(SITE).map((c) => c.source);
  assert.deepEqual(found.filter((f) => !documented.includes(f)).sort(), [], "website routes without a contract (add one in apps/opex-api/src/openapi/site.ts)");
  assert.deepEqual(documented.filter((f) => !found.includes(f)).sort(), [], "site contracts pointing at missing files");
});
