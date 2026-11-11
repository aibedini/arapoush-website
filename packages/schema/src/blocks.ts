import type { GroupField } from "./fields.ts";

/**
 * Page-builder blocks (P12). Built-in home sections read their own entries; blocks carry their data
 * in the layout (`sections[i].props`). One superset group serves every block kind; the console shows
 * only the fields of the selected kind (BLOCK_FIELDS).
 */
export const SECTION_TYPES = ["hero", "products", "applications", "insights", "partners", "certifications"] as const;
export const BLOCK_KINDS = ["richText", "imageText", "cta", "faq", "form", "spacer"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const isBlockKind = (t: string): t is BlockKind => (BLOCK_KINDS as readonly string[]).includes(t);

/** Built-in sections → the entry their copy lives in (the visual editor edits that entry). */
export const SECTION_ENTRY: Record<SectionType, string> = {
  hero: "page.home.hero",
  products: "page.home.products",
  applications: "page.home.applications",
  insights: "page.home.insights",
  partners: "page.home.partners",
  certifications: "page.home.certifications",
};

const L = (label: string, multiline = false, max = 4000) => ({ kind: "text" as const, localized: true, multiline, max, label });

export const BLOCK_PROPS: GroupField = {
  kind: "group",
  label: "Block content",
  fields: {
    eyebrow: L("Eyebrow", false, 80),
    title: L("Title", false, 200),
    body: L("Text", true),
    image: { kind: "image", label: "Image" },
    imageSide: { kind: "enum", values: ["start", "end"], label: "Image side" },
    tone: { kind: "enum", values: ["light", "dark"], label: "Background" },
    button: { kind: "group", label: "Button", fields: { label: L("Button label", false, 60), href: { kind: "url", label: "Button link" } } },
    items: { kind: "list", label: "Questions", max: 30, of: { kind: "group", fields: { q: L("Question", false, 300), a: L("Answer", true, 3000) } } },
    form: { kind: "text", localized: false, max: 40, label: "Form address (slug)" },
    size: { kind: "enum", values: ["s", "m", "l"], label: "Space" },
  },
};

/** Which block fields each kind uses (the console shows only these). */
export const BLOCK_FIELDS: Record<BlockKind, (keyof typeof BLOCK_PROPS.fields)[]> = {
  richText: ["eyebrow", "title", "body", "tone"],
  imageText: ["eyebrow", "title", "body", "image", "imageSide", "button", "tone"],
  cta: ["title", "body", "button", "tone"],
  faq: ["eyebrow", "title", "items"],
  form: ["eyebrow", "title", "body", "form", "tone"],
  spacer: ["size"],
};

export type L10n = Partial<Record<"fa" | "en" | "tr", string>>;
export type BlockProps = {
  eyebrow?: L10n;
  title?: L10n;
  body?: L10n;
  image?: { src: string; width?: number; height?: number; alt?: L10n };
  imageSide?: "start" | "end";
  tone?: "light" | "dark";
  button?: { label?: L10n; href?: string };
  items?: { q?: L10n; a?: L10n }[];
  form?: string;
  size?: "s" | "m" | "l";
};
export type LayoutSection = { id: string; type: SectionType | BlockKind; enabled: boolean; props?: BlockProps };

/** A new block with sensible starter content. */
export function newBlock(kind: BlockKind, id: string): LayoutSection {
  const base: Record<BlockKind, BlockProps> = {
    richText: { title: { fa: "عنوان تازه", en: "New heading" }, body: { fa: "متن این بخش را بنویسید.", en: "Write this section's text." }, tone: "light" },
    imageText: { title: { fa: "عنوان تازه", en: "New heading" }, body: { fa: "متن کنار تصویر.", en: "Text beside the image." }, imageSide: "end", tone: "light" },
    cta: { title: { fa: "آماده‌اید شروع کنیم؟", en: "Ready to start?" }, body: {}, button: { label: { fa: "تماس با ما", en: "Contact us" }, href: "#contact" }, tone: "dark" },
    faq: { title: { fa: "پرسش‌های پرتکرار", en: "Frequently asked questions" }, items: [{ q: { fa: "پرسش", en: "Question" }, a: { fa: "پاسخ", en: "Answer" } }] },
    form: { title: { fa: "با ما در تماس باشید", en: "Get in touch" }, form: "contact", tone: "light" },
    spacer: { size: "m" },
  };
  return { id, type: kind, enabled: true, props: base[kind] };
}
