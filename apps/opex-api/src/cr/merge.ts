import { canonical } from "../ids.ts";
import { getAt, parsePath, formatPath, setAt } from "@arapoush/schema";

/** One proposed change (plan §7.2). `old` is the value at `path` in the revision the author started from. */
export type Item = { id: string; path: string; op: "set" | "insert" | "remove"; old: unknown; value: unknown };
export type Conflict = { item: string; path: string; expected: unknown; current: unknown };

export const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null);

/** Path of the list that holds `path`'s last item selector: /a/b[id=x] → /a/b. */
const listOf = (path: string) => {
  const p = parsePath(path);
  const last = p.segments.at(-1);
  if (!last || "key" in last) throw new Error("Path does not end at a list item");
  return formatPath({ segments: p.segments.slice(0, -1) });
};

/**
 * Three-way merge onto the current draft: an item applies when the field still holds the value the
 * author saw (or already holds the proposed value); otherwise it is a conflict and nothing applies.
 */
export function applyItems(current: unknown, items: Item[]): { data: unknown; conflicts: Conflict[] } {
  let data = current;
  const conflicts: Conflict[] = [];
  for (const it of items) {
    if (it.op === "set") {
      const now = getAt(data, it.path);
      if (same(now, it.value)) continue;
      if (!same(now, it.old)) {
        conflicts.push({ item: it.id, path: it.path, expected: it.old ?? null, current: now ?? null });
        continue;
      }
      data = setAt(data, it.path, it.value);
    } else if (it.op === "insert") {
      // `path` names the list; the new item must not collide with an existing key.
      const list = getAt(data, it.path);
      if (!Array.isArray(list)) {
        conflicts.push({ item: it.id, path: it.path, expected: "list", current: list ?? null });
        continue;
      }
      if (list.some((x) => same(x, it.value))) continue;
      data = setAt(data, it.path, [...list, it.value]);
    } else {
      const now = getAt(data, it.path);
      if (now === undefined) continue; // already gone
      if (!same(now, it.old)) {
        conflicts.push({ item: it.id, path: it.path, expected: it.old ?? null, current: now });
        continue;
      }
      const lp = listOf(it.path);
      const list = getAt(data, lp) as unknown[];
      data = setAt(data, lp, list.filter((x) => !same(x, now)));
    }
  }
  return conflicts.length ? { data: current, conflicts } : { data, conflicts };
}

/** Normalised Levenshtein distance (0 = same, 1 = completely different). */
export function editRatio(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n]! / Math.max(m, n);
}
