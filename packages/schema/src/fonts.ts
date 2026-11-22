import type { GroupField } from "./fields.ts";
import { LOCALES, type Locale } from "./fields.ts";

/**
 * Site fonts (`global.site` → `fonts`). Uploaded families live in the media library; each language
 * picks a text and a heading family, and any section of a page (or a slider layer) can use its own.
 * Built-in families stay in code (next/font): `sans` (the language's text face), `ui`, `mark`.
 */
export type FontFile = { src: string; weight?: number; style?: "normal" | "italic" };
export type FontFamily = { key: string; name: string; files: FontFile[]; fallback?: "sans" | "serif" | "mono" };
export type FontChoice = { body?: string; heading?: string };
export type FontSettings = { families?: FontFamily[]; locales?: Partial<Record<Locale, FontChoice>>; sections?: Record<string, string> };

export const BUILTIN_FONTS = { sans: "متن زبان (پیش‌فرض)", ui: "رابط (Inter / وزیرمتن)", mark: "JetBrains Mono (نشان)" } as const;

const choice: GroupField = {
  kind: "group",
  fields: { body: { kind: "text", localized: false, max: 40, label: "Text font" }, heading: { kind: "text", localized: false, max: 40, label: "Heading font" } },
};

export const FONTS_FIELD: GroupField = {
  kind: "group",
  label: "Fonts",
  fields: {
    families: {
      kind: "list",
      key: "key",
      max: 30,
      label: "Uploaded font families",
      of: {
        kind: "group",
        fields: {
          key: { kind: "text", localized: false, max: 40, required: true, label: "Key" },
          name: { kind: "text", localized: false, max: 80, required: true, label: "Name" },
          fallback: { kind: "enum", values: ["sans", "serif", "mono"], label: "Fallback" },
          files: {
            kind: "list",
            max: 12,
            label: "Files",
            of: {
              kind: "group",
              fields: {
                src: { kind: "file", formats: ["woff2", "woff", "ttf", "otf"], required: true, label: "File" },
                weight: { kind: "number", integer: true, min: 100, max: 900, label: "Weight" },
                style: { kind: "enum", values: ["normal", "italic"], label: "Style" },
              },
            },
          },
        },
      },
    },
    locales: { kind: "group", label: "Per language", fields: Object.fromEntries(LOCALES.map((l) => [l, { ...choice, label: l }])) },
    sections: { kind: "map", keyPattern: "^[A-Za-z][\\w-]{0,39}$", keyLabel: "Section", label: "Per section", of: { kind: "text", localized: false, max: 40 } },
  },
};

const FALLBACK = { sans: "sans-serif", serif: "serif", mono: "monospace" } as const;
const FORMAT: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

/** CSS font-family for a font id (built-in or uploaded); undefined for an unknown id. */
export function fontStack(id: string | undefined, fonts: FontSettings | undefined, base = "var(--font-sans)"): string | undefined {
  if (!id) return undefined;
  if (id === "sans") return base;
  if (id === "ui") return "var(--font-ui)";
  if (id === "mark") return "var(--font-mark)";
  const f = fonts?.families?.find((x) => x.key === id);
  if (!f) return undefined;
  return `"opex-${f.key}", ${base}, ${FALLBACK[f.fallback ?? "sans"]}`;
}

const srcOk = (s: unknown): s is string => typeof s === "string" && /^\/media\/ast_[0-9A-Z]{26}\.(woff2|woff|ttf|otf)$/.test(s);

/** @font-face rules for the uploaded families in `ids` (only what a page uses gets downloaded). */
export function fontFaces(ids: Iterable<string>, fonts: FontSettings | undefined): string {
  const want = new Set(ids);
  return (fonts?.families ?? [])
    .filter((f) => want.has(f.key) && /^[a-z0-9][a-z0-9-]{0,39}$/i.test(f.key))
    .flatMap((f) =>
      f.files.filter((x) => srcOk(x.src)).map((x) => {
        const ext = x.src.split(".").pop()!;
        const w = Number.isInteger(x.weight) && x.weight! >= 100 && x.weight! <= 900 ? x.weight : 400;
        return `@font-face{font-family:"opex-${f.key}";src:url(${x.src}) format("${FORMAT[ext]}");font-weight:${w};font-style:${x.style === "italic" ? "italic" : "normal"};font-display:swap}`;
      }),
    )
    .join("");
}

/**
 * The site-wide font CSS for one language: @font-face for what it uses, the language's text and
 * heading families, and the per-section families (`[data-font-scope="<section id>"]`).
 */
export function fontCss(fonts: FontSettings | undefined, locale: Locale, extra: Iterable<string> = []): string {
  if (!fonts) return "";
  const used = new Set<string>(extra);
  const rules: string[] = [];
  const c = fonts.locales?.[locale] ?? {};
  // Spelled out: a custom property that refers to itself (--font-sans: …var(--font-sans)) is invalid.
  const base = locale === "fa" ? "var(--font-vazir), var(--font-helvetica), Tahoma" : "var(--font-helvetica), Arial";
  const body = fontStack(c.body, fonts, base);
  const heading = fontStack(c.heading, fonts, base);
  if (body && c.body !== "sans") {
    used.add(c.body!);
    // --font-sans carries every text style of the design; --font-ui the small UI labels.
    rules.push(`:root:lang(${locale}){--font-sans:${body}${c.body === "ui" ? "" : `;--font-ui:${body}`}}`);
  }
  if (heading && c.heading !== "sans") {
    used.add(c.heading!);
    rules.push(`:is(h1,h2,h3,.t-display){font-family:${heading}}`);
  }
  for (const [section, id] of Object.entries(fonts.sections ?? {})) {
    const s = fontStack(id, fonts, base);
    if (!s || !/^[A-Za-z][\w-]{0,39}$/.test(section)) continue;
    used.add(id);
    rules.push(`[data-font-scope="${section}"]{--font-sans:${s}${id === "ui" ? "" : `;--font-ui:${s}`}}`);
  }
  return fontFaces(used, fonts) + rules.join("");
}
