/**
 * AI translation helpers (shared by the API and the console): find every translatable string of an
 * entry by walking its schema, and write translations back. Only localized text (and image alt
 * text) is touched; locked subtrees, urls, numbers and media stay as they are.
 */
import { LOCALES, type Field, type GroupField, type Locale, type Localized } from "./fields.ts";

/**
 * Language names. Adding a language to the site: add its code to LOCALES (fields.ts) and a row
 * here; the translator, the console pickers and coverage counts pick it up from these two lists.
 */
export const LOCALE_INFO: Record<Locale, { name: string; native: string; dir: "rtl" | "ltr" }> = {
  fa: { name: "Persian (Farsi)", native: "فارسی", dir: "rtl" },
  en: { name: "English", native: "English", dir: "ltr" },
  tr: { name: "Turkish", native: "Türkçe", dir: "ltr" },
};

export type TranslateMode = "missing" | "all";

/** One localized value found in an entry. `path` uses the field-path syntax (`/hero/slides[id=a]/title`). */
export type LocalizedLeaf = { path: string; value: Localized; max?: number };

type Visit = (leaf: LocalizedLeaf) => Localized | undefined;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const join = (base: string, k: string) => (base === "/" || base === "" ? `/${k}` : `${base}/${k}`);

function visitAlt(img: unknown, path: string, visit: Visit): unknown {
  if (!isObj(img) || !isObj(img.alt)) return img;
  const next = visit({ path: join(path, "alt"), value: img.alt as Localized, max: 300 });
  return next ? { ...img, alt: next } : img;
}

/** Walks `value` along `field`, calling `visit` at every localized text; a returned value replaces it. */
function walk(field: Field, value: unknown, path: string, visit: Visit): unknown {
  if (value === undefined || value === null || field.locked) return value;
  switch (field.kind) {
    case "text": {
      if (!field.localized || !isObj(value)) return value;
      return visit({ path, value: value as Localized, max: field.max }) ?? value;
    }
    case "image": {
      if (field.path || !isObj(value)) return value;
      if (field.perLocale) return Object.fromEntries(Object.entries(value).map(([k, img]) => [k, visitAlt(img, join(path, k), visit)]));
      return visitAlt(value, path, visit);
    }
    case "group": {
      if (!isObj(value)) return value;
      const out: Record<string, unknown> = { ...value };
      for (const [k, f] of Object.entries(field.fields)) if (k in value) out[k] = walk(f, value[k], join(path, k), visit);
      return out;
    }
    case "list": {
      if (!Array.isArray(value)) return value;
      return value.map((item, i) => {
        const id = field.key && isObj(item) ? item[field.key] : undefined;
        return walk(field.of, item, id !== undefined ? `${path}[${field.key}=${String(id)}]` : `${path}[${i}]`, visit);
      });
    }
    case "map": {
      if (!isObj(value)) return value;
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(field.of, v, join(path, k), visit)]));
    }
    default:
      return value;
  }
}

/** True when `path` is `scope` or inside it (scope `/sections[id=x]` covers `/sections[id=x]/props/title`). */
export const inScope = (path: string, scope?: string) => !scope || scope === "/" || path === scope || path.startsWith(scope + "/") || path.startsWith(scope + "[");

/** Every localized value in `data` (optionally under `scope`). */
export function localizedLeaves(schema: GroupField, data: unknown, scope?: string): LocalizedLeaf[] {
  const out: LocalizedLeaf[] = [];
  walk(schema, data, "/", (leaf) => void (inScope(leaf.path, scope) && out.push(leaf)));
  return out;
}

const has = (v: Localized, l: Locale) => typeof v[l] === "string" && v[l]!.trim() !== "";

/** Whether the target needs this value: it has source text, and (mode "missing") the target is empty. */
export const needsTranslation = (v: Localized, from: Locale, to: Locale, mode: TranslateMode) => from !== to && has(v, from) && (mode === "all" || !has(v, to));

/** How many translatable values each language has filled (for coverage bars). */
export function coverage(schema: GroupField, data: unknown): { total: number; filled: Record<Locale, number> } {
  const leaves = localizedLeaves(schema, data).filter((l) => LOCALES.some((x) => has(l.value, x)));
  const filled = Object.fromEntries(LOCALES.map((l) => [l, leaves.filter((x) => has(x.value, l)).length])) as Record<Locale, number>;
  return { total: leaves.length, filled };
}

/**
 * Writes translations into `data`. `done` maps path → { source text, per-target text }. A value is
 * written only where the source text is still the one that was translated, so edits made while the
 * AI worked are never overwritten with a translation of older text.
 */
export function applyTranslations(schema: GroupField, data: unknown, from: Locale, done: Map<string, { source: string; out: Partial<Record<Locale, string>> }>): { data: unknown; written: number } {
  let written = 0;
  const next = walk(schema, data, "/", (leaf) => {
    const d = done.get(leaf.path);
    if (!d || leaf.value[from] !== d.source) return undefined;
    const out: Localized = { ...leaf.value };
    for (const [l, s] of Object.entries(d.out) as [Locale, string][]) {
      if (leaf.max && s.length > leaf.max) continue;
      out[l] = s;
      written++;
    }
    return out;
  });
  return { data: next, written };
}
