#!/usr/bin/env node
// `pnpm changelog`: regenerates docs/changelog.md from the Conventional Commit history (newest first).
// Run it when cutting a release (or after a phase) and commit the result; it is not checked per commit,
// because a commit cannot contain its own entry.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const SEP = "\u001e";
const log = execFileSync("git", ["log", "--no-merges", `--format=%h${SEP}%ad${SEP}%s${SEP}%b${SEP}\u001f`, "--date=short"], { cwd: root, encoding: "utf8" });
const TYPE = { feat: "Features", fix: "Fixes", perf: "Performance", refactor: "Refactoring", docs: "Documentation", chore: "Maintenance", test: "Tests", ci: "CI", build: "Build" };

const rank = (t) => (t in TYPE ? Object.keys(TYPE).indexOf(t) : 99);
const entries = log
  .split("\u001f")
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [hash, date, subject, body = ""] = r.split(SEP);
    const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject ?? "");
    const breaking = !!m?.[3] || /^BREAKING CHANGE:|^API-Break: approved/m.test(body);
    return { hash, date, type: m?.[1] ?? "other", scope: m?.[2] ?? null, text: m?.[4] ?? subject, breaking };
  });

// Group by month, then by type.
const months = new Map();
for (const e of entries) {
  const k = e.date.slice(0, 7);
  if (!months.has(k)) months.set(k, []);
  months.get(k).push(e);
}
const out = ["# Changelog", "", "Generated from the commit history by `pnpm changelog` (Conventional Commits). Phases: P0–P13 (site and OPEX), D1–D6 (documentation system).", ""];
for (const [month, list] of months) {
  out.push(`## ${month}`, "");
  const byType = new Map();
  for (const e of list) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  for (const [type, es] of [...byType].sort(([a], [b]) => rank(a) - rank(b))) {
    out.push(`### ${TYPE[type] ?? "Other"}`, "");
    for (const e of es) out.push(`- ${e.breaking ? "**BREAKING** " : ""}${e.scope ? `**${e.scope}:** ` : ""}${e.text} (\`${e.hash}\`, ${e.date})`);
    out.push("");
  }
}
writeFileSync(path.join(root, "docs/changelog.md"), out.join("\n"));
console.log(`docs/changelog.md: ${entries.length} commits`);
