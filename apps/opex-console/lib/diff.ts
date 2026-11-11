/** Word-level diff for reviewing text changes (LCS over whitespace-separated tokens). */
export type Part = { kind: "same" | "add" | "del"; text: string };

export function wordDiff(a: string, b: string): Part[] {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
  // Long texts: fall back to a plain before/after (keeps the review page fast).
  if (x.length * y.length > 250_000) return [{ kind: "del", text: a }, { kind: "add", text: b }];
  const m = x.length, n = y.length;
  const L = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i]![j] = x[i] === y[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: Part[] = [];
  const push = (kind: Part["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      push("same", x[i++]!);
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) push("del", x[i++]!);
    else push("add", y[j++]!);
  }
  while (i < m) push("del", x[i++]!);
  while (j < n) push("add", y[j++]!);
  return out;
}

/** Short, readable rendering of any JSON value. */
export const show = (v: unknown): string => (v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** "/hero/title@en" → { path: "/hero/title", locale: "en" } */
export const splitLocale = (p: string) => {
  const m = /^(.*)@([a-z]{2})$/.exec(p);
  return m ? { path: m[1]!, locale: m[2]! } : { path: p, locale: null as string | null };
};
