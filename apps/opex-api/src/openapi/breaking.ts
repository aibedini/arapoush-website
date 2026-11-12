import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Breaking-change check (D2), deterministic: compares docs/api/*.openapi.json with the same files on a
 * base ref (default origin/main) and lists changes that can break an existing client.
 *
 *   node src/openapi/breaking.ts [--base <ref>]
 *
 * Breaking: a removed operation or success status; a removed response property, or one that became
 * optional/nullable; a new required parameter or request property; a removed request property
 * (bodies are strict); narrower request enums, lengths, ranges or patterns; a changed type.
 * Allowed when a commit since the base carries `API-Break: approved <reason>` and info.version got a
 * higher major or minor number. Additions (new routes, optional inputs, new response fields) pass.
 */
type J = Record<string, unknown>;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const base = arg("--base") ?? process.env.API_BASE_REF ?? "origin/main";
const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const issues: string[] = [];
const FILES = ["opex.openapi.json", "partner.openapi.json", "site.openapi.json"];

function resolve(doc: J, s: unknown): J {
  let x = (s ?? {}) as J;
  for (let i = 0; i < 20 && typeof x.$ref === "string"; i++) x = ((doc.components as J).schemas as J)[(x.$ref as string).split("/").pop()!] as J;
  return x ?? {};
}
const types = (s: J) => new Set([s.type].flat().filter(Boolean) as string[]);
const nullable = (s: J) => types(s).has("null") || (Array.isArray(s.anyOf) && (s.anyOf as J[]).some((a) => a.type === "null"));

/** `dir` = "req": the client sends it (narrowing breaks); "res": the client reads it (removal breaks). */
function compare(a: J, b: J, docA: J, docB: J, where: string, dir: "req" | "res", depth = 0) {
  if (depth > 12) return;
  const x = resolve(docA, a);
  const y = resolve(docB, b);
  const ta = types(x);
  const tb = types(y);
  if (ta.size && tb.size) {
    const lost = [...ta].filter((t) => !tb.has(t) && t !== "null");
    const gained = [...tb].filter((t) => !ta.has(t) && t !== "null");
    if (dir === "req" && lost.length) issues.push(`${where}: no longer accepts type ${lost.join("/")}`);
    if (dir === "res" && gained.length) issues.push(`${where}: may now return type ${gained.join("/")}`);
  }
  if (dir === "res" && !nullable(x) && nullable(y)) issues.push(`${where}: may now be null`);
  if (dir === "req") {
    if (Array.isArray(x.enum) && Array.isArray(y.enum)) for (const v of x.enum) if (!y.enum.includes(v)) issues.push(`${where}: no longer accepts ${JSON.stringify(v)}`);
    const tighter = (k: string, up: boolean) => {
      const va = x[k] as number | undefined;
      const vb = y[k] as number | undefined;
      if (vb !== undefined && (va === undefined || (up ? vb > va : vb < va))) issues.push(`${where}: ${k} ${va ?? "none"} → ${vb}`);
    };
    tighter("minLength", true);
    tighter("maxLength", false);
    tighter("minimum", true);
    tighter("maximum", false);
    tighter("minItems", true);
    tighter("maxItems", false);
    if (y.pattern && y.pattern !== x.pattern) issues.push(`${where}: new or changed pattern`);
  }
  const pa = (x.properties ?? {}) as Record<string, J>;
  const pb = (y.properties ?? {}) as Record<string, J>;
  const ra = new Set((x.required ?? []) as string[]);
  const rb = new Set((y.required ?? []) as string[]);
  for (const k of Object.keys(pa)) {
    if (!(k in pb)) {
      if (dir === "res") issues.push(`${where}.${k}: removed from the response`);
      else if (y.additionalProperties === false) issues.push(`${where}.${k}: no longer accepted (strict body)`);
      continue;
    }
    if (dir === "res" && ra.has(k) && !rb.has(k)) issues.push(`${where}.${k}: may now be missing`);
    compare(pa[k]!, pb[k]!, docA, docB, `${where}.${k}`, dir, depth + 1);
  }
  if (dir === "req") for (const k of rb) if (!ra.has(k)) issues.push(`${where}.${k}: newly required`);
  if (x.items && y.items) compare(x.items as J, y.items as J, docA, docB, `${where}[]`, dir, depth + 1);
}

function check(file: string, a: J, b: J) {
  const pa = a.paths as Record<string, Record<string, J>>;
  const pb = b.paths as Record<string, Record<string, J>>;
  for (const [p, ops] of Object.entries(pa)) {
    for (const [m, opA] of Object.entries(ops)) {
      const opB = pb[p]?.[m];
      const at = `${file} ${m.toUpperCase()} ${p}`;
      if (!opB) {
        issues.push(`${at}: operation removed`);
        continue;
      }
      const params = (o: J) => new Map(((o.parameters ?? []) as J[]).filter((x) => x.name).map((x) => [`${x.in}:${x.name}`, x]));
      const qa = params(opA);
      const qb = params(opB);
      for (const [k, prm] of qb) if (prm.required && !qa.get(k)?.required) issues.push(`${at}: parameter ${k} is now required`);
      for (const [k, prm] of qa) if (qb.has(k)) compare(prm.schema as J, qb.get(k)!.schema as J, a, b, `${at} param ${k}`, "req");
      const body = (o: J) => Object.values(((o.requestBody as J)?.content ?? {}) as Record<string, J>)[0]?.schema as J | undefined;
      const ba = body(opA);
      const bb = body(opB);
      if (!ba && bb && (opB.requestBody as J).required) issues.push(`${at}: request body is now required`);
      if (ba && bb) compare(ba, bb, a, b, `${at} body`, "req");
      const ra = (opA.responses ?? {}) as Record<string, J>;
      const rb = (opB.responses ?? {}) as Record<string, J>;
      for (const [status, r] of Object.entries(ra)) {
        if (!/^2/.test(status)) continue;
        if (!rb[status]) {
          issues.push(`${at}: response ${status} removed`);
          continue;
        }
        const sa = Object.values((r.content ?? {}) as Record<string, J>)[0]?.schema as J | undefined;
        const sb = Object.values((rb[status]!.content ?? {}) as Record<string, J>)[0]?.schema as J | undefined;
        if (sa && sb) compare(sa, sb, a, b, `${at} → ${status}`, "res");
      }
    }
  }
}

let baseDocs: Record<string, J>;
try {
  git("rev-parse", "--verify", base);
  baseDocs = Object.fromEntries(FILES.flatMap((f) => {
    try {
      return [[f, JSON.parse(git("show", `${base}:docs/api/${f}`)) as J]];
    } catch {
      return [];
    }
  }));
} catch {
  console.log(`Base ${base} not found; nothing to compare.`);
  process.exit(0);
}
const now = Object.fromEntries(FILES.map((f) => [f, JSON.parse(readFileSync(path.join(root, "docs/api", f), "utf8")) as J]));
for (const f of FILES) if (baseDocs[f]) check(f, baseDocs[f]!, now[f]!);

if (!issues.length) {
  console.log(`No breaking API changes against ${base}.`);
  process.exit(0);
}
const uniq = [...new Set(issues)];
const ver = (d: J | undefined) => String(((d?.info ?? {}) as J).version ?? "0.0.0").split(".").map(Number);
const [a1, a2] = ver(baseDocs["opex.openapi.json"]);
const [b1, b2] = ver(now["opex.openapi.json"]);
const bumped = b1! > a1! || (b1 === a1 && b2! > a2!);
let approved = false;
try {
  approved = /^API-Break: approved .{3,}/m.test(git("log", "--format=%B", `${base}..HEAD`));
} catch {}
console.log(`${uniq.length} breaking change(s) against ${base}:\n${uniq.map((i) => `  - ${i}`).join("\n")}`);
if (approved && bumped) {
  console.log("Approved (API-Break trailer + version bump).");
  process.exit(0);
}
console.error(
  `\nTo ship a deliberate break: bump API_VERSION (apps/opex-api/src/openapi/specs.ts) by a minor or major step, regenerate (pnpm docs:api), and add a commit trailer "API-Break: approved <reason>". Tell the AraCMS team first when partner.openapi.json is affected.`,
);
process.exit(1);
