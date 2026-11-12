import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CONTRACTS } from "./registry.ts";

/**
 * `pnpm docs:coverage`: runs the API tests and reports which documented operations (and statuses)
 * they exercised, so untested contracts are visible. Informational; the contract test itself is the
 * gate (every exercised response must match its contract).
 */
const file = path.join(mkdtempSync(path.join(tmpdir(), "opex-cov-")), "seen.txt");
try {
  execFileSync(process.execPath, ["--no-warnings", "--test", "--test-concurrency=1", "src/**/*.test.ts"], { stdio: "ignore", env: { ...process.env, CONTRACT_COVERAGE_FILE: file }, shell: false });
} catch {
  console.error("Some tests failed; coverage below is partial.");
}
const seen = new Set(readFileSync(file, "utf8").split("\n").filter(Boolean));
const ops = new Set([...seen].map((s) => s.split(" ")[0]));
const missing = CONTRACTS.filter((c) => !ops.has(c.id));
const pct = Math.round(((CONTRACTS.length - missing.length) / CONTRACTS.length) * 100);
console.log(`Operations exercised by tests: ${CONTRACTS.length - missing.length}/${CONTRACTS.length} (${pct}%); operation/status pairs: ${seen.size}`);
if (missing.length) console.log("Not yet exercised:\n" + missing.map((c) => `  ${c.method} ${c.path}  (${c.id})`).join("\n"));
