#!/usr/bin/env node
// Static documentation checks (D4), deterministic and offline:
//  1. Relative links in Markdown (docs/, READMEs, CLAUDE.md, runbooks) point at files that exist.
//  2. Every OPEX environment variable (apps/opex-api/src/config.ts) is documented for production:
//     in infra/.env.example or in the opex-api service of infra/docker-compose.prod.yml.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const problems = [];

// ── 1. Links ──
const SKIP = new Set(["node_modules", ".git", ".next", "graphify-out", ".turbo", "dist", "storybook-static", ".lighthouseci"]);
function* markdown(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* markdown(p);
    else if (d.name.endsWith(".md")) yield p;
  }
}
let links = 0;
for (const file of markdown(root)) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|#|\/)/.test(href)) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(href.split("#")[0]).split(":")[0]);
    links++;
    if (!existsSync(target)) problems.push(`${path.relative(root, file)}: broken link ${href}`);
  }
}

// ── 2. Environment variables ──
const config = readFileSync(path.join(root, "apps/opex-api/src/config.ts"), "utf8");
const envBlock = config.slice(config.indexOf("const Env = z.object({"), config.indexOf("});", config.indexOf("const Env = z.object({")));
const keys = [...envBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
const example = readFileSync(path.join(root, "infra/.env.example"), "utf8");
const compose = readFileSync(path.join(root, "infra/docker-compose.prod.yml"), "utf8");
const api = compose.slice(compose.indexOf("  opex-api:"), compose.indexOf("\n  opex-console:"));
// Development-only settings with safe defaults, set by the images themselves.
const DEV_ONLY = new Set(["HOST", "PORT", "DATA_DIR", "MEDIA_DIR", "LOG_LEVEL"]);
for (const k of keys) {
  if (DEV_ONLY.has(k)) continue;
  if (!new RegExp(`^${k}=`, "m").test(example) && !new RegExp(`^\\s+${k}:`, "m").test(api)) problems.push(`config ${k} is documented neither in infra/.env.example nor in the opex-api service of infra/docker-compose.prod.yml`);
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log(`Docs OK: ${links} relative links resolve; ${keys.length} environment variables documented.`);
