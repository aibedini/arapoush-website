#!/usr/bin/env node
// Documentation impact check (D4, docs/DOCS-PLAN.md). Deterministic: no AI judgement decides pass/fail.
//
//   node scripts/docs/impact.mjs --staged --message .git/COMMIT_EDITMSG   (commit-msg hook)
//   node scripts/docs/impact.mjs --range origin/main..HEAD                (CI: every commit in the range)
//
// A commit that changes a documented surface (API routes, migrations, configuration, the content
// schema, auth, shared UI components) must also change documentation (docs/**, README/CLAUDE.md,
// *.stories.tsx, infra/.env.example) or say why not with a trailer:
//   Docs-Impact: none <reason>
// Not every code change needs docs; the trailer is the reviewed explanation.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const SURFACES = [
  { name: "API routes or contracts", re: /^apps\/opex-api\/src\/.+\/(routes|contract)\.ts$|^apps\/opex-api\/src\/openapi\/site\.ts$|^apps\/web\/app\/.+\/route\.ts$/ },
  { name: "database migrations", re: /^apps\/opex-api\/src\/db\/migrations\/.+\.sql$/ },
  { name: "configuration", re: /^apps\/opex-api\/src\/config\.ts$|^apps\/web\/next\.config\.ts$|^infra\/(?!\.env\.example).+|^apps\/web\/middleware\.ts$|^apps\/opex-console\/middleware\.ts$/ },
  { name: "content schema", re: /^packages\/schema\/src\/(?!generated\/).+(?<!\.test)\.ts$|^packages\/schema\/scripts\/generate\.ts$/ },
  { name: "authentication and request integrity", re: /^apps\/opex-api\/src\/(auth|oauth)\/.+(?<!\.test)\.ts$|^apps\/opex-api\/src\/partner\/integrity\.ts$/ },
  { name: "shared UI components", re: /^apps\/(web|opex-console)\/components\/.+\.tsx$/ },
];
const DOCS = /^docs\/|(^|\/)README\.md$|^CLAUDE\.md$|\.stories\.tsx$|^infra\/\.env\.example$|^\.claude\/skills\/|^\.github\/pull_request_template\.md$/;
const TRAILER = /^Docs-Impact:\s*(none\s+\S.{2,}|\S.+)$/im;

function judge(files, message, label) {
  const touched = SURFACES.filter((s) => files.some((f) => s.re.test(f) && !/\.test\.tsx?$/.test(f)));
  if (!touched.length) return true;
  if (files.some((f) => DOCS.test(f))) return true;
  if (TRAILER.test(message)) return true;
  console.error(
    `${label}: changes ${touched.map((s) => s.name).join(", ")} without a documentation change.\n` +
      `  Update the docs (docs/**, a README, stories, infra/.env.example), or add a trailer explaining why none is needed:\n` +
      `  Docs-Impact: none <reason>`,
  );
  return false;
}

let ok = true;
if (args.includes("--staged")) {
  const files = git("diff", "--cached", "--name-only", "--diff-filter=ACMRD").split("\n").filter(Boolean);
  const msgFile = opt("--message");
  const message = msgFile ? readFileSync(msgFile, "utf8") : "";
  ok = judge(files, message, "This commit");
} else {
  const range = opt("--range") ?? "origin/main..HEAD";
  let commits = [];
  try {
    commits = git("rev-list", "--no-merges", range).split("\n").filter(Boolean);
  } catch {
    console.log(`Range ${range} not available; nothing to check.`);
    process.exit(0);
  }
  for (const c of commits) {
    const files = git("show", "--name-only", "--format=", c).split("\n").filter(Boolean);
    if (!judge(files, git("show", "-s", "--format=%B", c), `Commit ${c.slice(0, 7)}`)) ok = false;
  }
  if (ok) console.log(`Documentation impact: ${commits.length} commit(s) OK.`);
}
process.exit(ok ? 0 : 1);
