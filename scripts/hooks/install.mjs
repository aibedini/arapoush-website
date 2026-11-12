#!/usr/bin/env node
// Installs the documentation git hooks (D4). Runs on `pnpm install` (the "prepare" script).
// Keeps other tools' hooks (graphify's post-commit, post-checkout, post-merge): only the block
// between the opex-docs markers is managed here.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const hooks = path.join(root, ".git", "hooks");
if (process.env.CI || !existsSync(hooks)) process.exit(0);

const START = "# opex-docs-start";
const END = "# opex-docs-end";
const BLOCKS = {
  "pre-commit": `${START}
# Fast documentation checks on staged files (docs/DOCS-PLAN.md, D4). Skip once with --no-verify
# only if you understand why; CI runs the same checks and blocks the merge.
node scripts/docs/precommit.mjs || exit 1
${END}`,
  "commit-msg": `${START}
# Documented surfaces need a docs change or a "Docs-Impact: none <reason>" trailer.
node scripts/docs/impact.mjs --staged --message "$1" || exit 1
${END}`,
};

for (const [name, block] of Object.entries(BLOCKS)) {
  const file = path.join(hooks, name);
  let text = existsSync(file) ? readFileSync(file, "utf8") : "#!/bin/sh\n";
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  text = re.test(text) ? text.replace(re, block + "\n") : text.replace(/\s*$/, "\n") + block + "\n";
  writeFileSync(file, text);
  chmodSync(file, 0o755);
}
console.log("Documentation hooks installed (pre-commit, commit-msg).");
