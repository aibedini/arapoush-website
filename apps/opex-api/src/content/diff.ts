import { isLocalizedText, LOCALES } from "@arapoush/schema";

export type Change = { op: "add" | "remove" | "replace"; path: string; old?: unknown; new?: unknown };

/**
 * Field-level diff between two revisions, in field-path notation (`/a/b[id=x]/c@fa`), so audit,
 * the console and AraCMS all speak about the same addresses. Lists of objects with `id` are
 * matched by id; other arrays by index.
 */
export function diff(a: unknown, b: unknown, path = ""): Change[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (isLocalizedText(a) && isLocalizedText(b)) {
    const out: Change[] = [];
    for (const l of LOCALES) if (a[l] !== b[l]) out.push(a[l] === undefined ? { op: "add", path: `${path || "/"}@${l}`, new: b[l] } : b[l] === undefined ? { op: "remove", path: `${path || "/"}@${l}`, old: a[l] } : { op: "replace", path: `${path || "/"}@${l}`, old: a[l], new: b[l] });
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = [...a, ...b].every((x) => x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string");
    if (keyed) {
      const out: Change[] = [];
      const am = new Map(a.map((x) => [(x as { id: string }).id, x]));
      const bm = new Map(b.map((x) => [(x as { id: string }).id, x]));
      for (const [id, x] of am) if (!bm.has(id)) out.push({ op: "remove", path: `${path}[id=${id}]`, old: x });
      for (const [id, x] of bm) out.push(...(am.has(id) ? diff(am.get(id), x, `${path}[id=${id}]`) : [{ op: "add" as const, path: `${path}[id=${id}]`, new: x }]));
      const order = (l: unknown[]) => l.map((x) => (x as { id: string }).id).join(",");
      if (out.length === 0 && order(a) !== order(b)) out.push({ op: "replace", path: `${path}#order`, old: order(a), new: order(b) });
      return out;
    }
    const out: Change[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) out.push({ op: "add", path: `${path}[${i}]`, new: b[i] });
      else if (i >= b.length) out.push({ op: "remove", path: `${path}[${i}]`, old: a[i] });
      else out.push(...diff(a[i], b[i], `${path}[${i}]`));
    }
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out: Change[] = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      if (av === undefined) out.push({ op: "add", path: `${path}/${k}`, new: bv });
      else if (bv === undefined) out.push({ op: "remove", path: `${path}/${k}`, old: av });
      else out.push(...diff(av, bv, `${path}/${k}`));
    }
    return out;
  }
  return [{ op: "replace", path: path || "/", old: a, new: b }];
}
