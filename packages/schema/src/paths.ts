/**
 * Field paths address any value in an entry: `/hero/slides[id=packaging]/lead@fa`.
 * Arrays of objects are addressed by their stable id (`[id=…]`); arrays of primitives by index
 * (`[2]`). The optional `@locale` suffix selects one language of a localized value.
 */

export type Segment = { key: string } | { index: number } | { match: { key: string; value: string } };
export type FieldPath = { segments: Segment[]; locale?: string };

const SEG = /^([^[\]]*)((?:\[[^\]]+\])*)$/;

export function parsePath(path: string): FieldPath {
  if (!path.startsWith("/")) throw new Error(`Field path must start with "/": ${path}`);
  let body = path;
  let locale: string | undefined;
  const at = path.lastIndexOf("@");
  if (at > 0 && !path.slice(at).includes("/")) {
    locale = path.slice(at + 1);
    body = path.slice(0, at);
  }
  const segments: Segment[] = [];
  for (const raw of body.split("/").slice(1)) {
    if (raw === "") continue;
    const m = SEG.exec(raw);
    if (!m) throw new Error(`Bad path segment "${raw}" in ${path}`);
    if (m[1]) segments.push({ key: m[1] });
    for (const sel of m[2]!.match(/\[[^\]]+\]/g) ?? []) {
      const inner = sel.slice(1, -1);
      if (/^\d+$/.test(inner)) segments.push({ index: Number(inner) });
      else {
        const eq = inner.indexOf("=");
        if (eq < 1) throw new Error(`Bad selector ${sel} in ${path}`);
        segments.push({ match: { key: inner.slice(0, eq), value: inner.slice(eq + 1) } });
      }
    }
  }
  return { segments, locale };
}

export function formatPath(p: FieldPath): string {
  let out = "";
  for (const s of p.segments) {
    if ("key" in s) out += `/${s.key}`;
    else if ("index" in s) out += `[${s.index}]`;
    else out += `[${s.match.key}=${s.match.value}]`;
  }
  return (out || "/") + (p.locale ? `@${p.locale}` : "");
}

type Container = Record<string, unknown> | unknown[];

function step(node: unknown, s: Segment): { parent: Container; slot: string | number } | null {
  if ("key" in s) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return null;
    return { parent: node as Record<string, unknown>, slot: s.key };
  }
  if (!Array.isArray(node)) return null;
  if ("index" in s) return s.index < node.length ? { parent: node, slot: s.index } : null;
  const i = node.findIndex((x) => x && typeof x === "object" && String((x as Record<string, unknown>)[s.match.key]) === s.match.value);
  return i < 0 ? null : { parent: node, slot: i };
}

/** Reads the value at `path` (undefined when it does not exist). */
export function getAt(root: unknown, path: string | FieldPath): unknown {
  const p = typeof path === "string" ? parsePath(path) : path;
  let node = root;
  for (const s of p.segments) {
    const st = step(node, s);
    if (!st) return undefined;
    node = (st.parent as Record<string | number, unknown>)[st.slot];
  }
  if (p.locale) return node && typeof node === "object" ? (node as Record<string, unknown>)[p.locale] : undefined;
  return node;
}

/** Returns a copy of `root` with `value` set at `path`. The path must already exist up to its last segment. */
export function setAt<T>(root: T, path: string | FieldPath, value: unknown): T {
  const p = typeof path === "string" ? parsePath(path) : path;
  const copy = structuredClone(root) as unknown;
  if (!p.segments.length && !p.locale) return value as T;
  let node = copy;
  const last = p.locale ? p.segments.length : p.segments.length - 1;
  for (let i = 0; i < last; i++) {
    const st = step(node, p.segments[i]!);
    if (!st) throw new Error(`Path not found: ${formatPath(p)}`);
    node = (st.parent as Record<string | number, unknown>)[st.slot];
  }
  if (p.locale) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`Not a localized value: ${formatPath(p)}`);
    (node as Record<string, unknown>)[p.locale] = value;
    return copy as T;
  }
  const lastSeg = p.segments[p.segments.length - 1]!;
  if ("key" in lastSeg) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`Path not found: ${formatPath(p)}`);
    (node as Record<string, unknown>)[lastSeg.key] = value;
  } else {
    const st = step(node, lastSeg);
    if (!st) throw new Error(`Path not found: ${formatPath(p)}`);
    (st.parent as unknown[])[st.slot as number] = value;
  }
  return copy as T;
}

/**
 * Glob match for grants and policies: `*` matches one segment, `**` any number. Selectors and
 * locales in the target are ignored unless the pattern names them.
 */
export function matchPath(pattern: string, path: string): boolean {
  const norm = (s: string) => s.replace(/@.*$/, "").replace(/\[[^\]]*\]/g, "");
  const pl = pattern.match(/@(.+)$/)?.[1];
  const tl = path.match(/@(.+)$/)?.[1];
  if (pl && pl !== "*" && pl !== tl) return false;
  const p = norm(pattern).split("/").filter(Boolean);
  const t = norm(path).split("/").filter(Boolean);
  const go = (i: number, j: number): boolean => {
    if (i === p.length) return j === t.length;
    if (p[i] === "**") return go(i + 1, j) || (j < t.length && go(i, j + 1));
    if (j === t.length) return false;
    return (p[i] === "*" || p[i] === t[j]) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

export const globMatch = (pattern: string, value: string) => new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(value);
