/**
 * Applies size charts to a catalogue file (the website seed or an exported draft):
 *   pnpm --filter @arapoush/opex-api tube:chart <catalogue.json> <chart.xlsx>... [--replace]
 * Writes the catalogue back in place and prints what changed. Operators use the console import
 * instead; this keeps the repository seed (apps/web/content/products/multi-layer-tube.json) in step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { importCharts } from "./import.ts";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const [target, ...charts] = args.filter((a) => !a.startsWith("--"));
if (!target || !charts.length) {
  console.error("usage: tube:chart <catalogue.json> <chart.xlsx>... [--replace]");
  process.exit(2);
}
const json = JSON.parse(readFileSync(target, "utf8"));
const r = importCharts(json, charts.map((f) => ({ name: path.basename(f), bytes: readFileSync(f) })), { keepMissing: !replace });
writeFileSync(target, JSON.stringify(r.catalogue, null, 2) + "\n");
for (const c of r.charts) console.log(`${c.file}: ${c.shape ?? "?"} Ø${c.diameters.join("/")} — ${c.sizes} sizes, ${c.closures.length} closures`);
for (const w of r.warnings) console.log(`  ! ${w}`);
