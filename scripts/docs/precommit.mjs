#!/usr/bin/env node
// pre-commit (D4): the fast part of `pnpm docs:check`, only when relevant files are staged.
// - API routes, contracts or website route handlers staged → the generated docs/api must match.
// - Markdown staged → relative links must resolve; config staged → env vars must be documented.
// The slower checks (contract tests, lint, breaking changes) run in CI.
import { execFileSync } from "node:child_process";

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" }).split("\n").filter(Boolean);
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
};

let ok = true;
const api = staged.some((f) => /^apps\/opex-api\/src\/.+\.ts$|^apps\/web\/app\/.+\/route\.ts$|^docs\/api\//.test(f));
if (api) ok = run("node", ["--no-warnings", "apps/opex-api/src/openapi/cli.ts", "--check"]) && ok;
if (staged.some((f) => f.endsWith(".md") || f === "apps/opex-api/src/config.ts" || f.startsWith("infra/"))) ok = run("node", ["scripts/docs/check.mjs"]) && ok;
if (!ok) {
  console.error("\nDocumentation checks failed. Run `pnpm docs:api` to regenerate the API docs, fix the links or env docs, then commit again.");
  process.exit(1);
}
