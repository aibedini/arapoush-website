import { FALLBACK, isLocalizedImage, isLocalizedText, LOCALES, type Locale } from "./fields.ts";

/**
 * Turns per-locale trees ({ fa: tree, en: tree, tr: tree }) into one tree whose string leaves are
 * { fa, en, tr }: the shape OPEX stores. Arrays are merged by position.
 */
export function mergeLocales(trees: Partial<Record<Locale, unknown>>): unknown {
  const present = LOCALES.filter((l) => trees[l] !== undefined);
  const first = trees[present[0]!];
  if (typeof first === "string") return Object.fromEntries(present.map((l) => [l, trees[l]]));
  if (typeof first !== "object" || first === null) return first;
  if (Array.isArray(first)) {
    const len = Math.max(...present.map((l) => (Array.isArray(trees[l]) ? (trees[l] as unknown[]).length : 0)));
    return Array.from({ length: len }, (_, i) => mergeLocales(Object.fromEntries(present.map((l) => [l, (trees[l] as unknown[] | undefined)?.[i]]).filter(([, v]) => v !== undefined))));
  }
  const keys = new Set(present.flatMap((l) => Object.keys((trees[l] as object) ?? {})));
  return Object.fromEntries([...keys].map((k) => [k, mergeLocales(Object.fromEntries(present.map((l) => [l, (trees[l] as Record<string, unknown>)?.[k]]).filter(([, v]) => v !== undefined)))]));
}

/**
 * The reverse: picks one locale out of a stored tree. Localized text falls back (FALLBACK); per-locale
 * images pick their variant or the default. Everything else passes through.
 */
export function pickLocale<T = unknown>(tree: unknown, locale: Locale): T {
  const go = (v: unknown): unknown => {
    if (isLocalizedText(v)) {
      for (const l of FALLBACK[locale]) if (typeof v[l] === "string") return v[l];
      return Object.values(v)[0];
    }
    if (isLocalizedImage(v)) return go(v[locale] ?? v.default);
    if (Array.isArray(v)) return v.map(go);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, go(x)]));
    return v;
  };
  return go(tree) as T;
}
