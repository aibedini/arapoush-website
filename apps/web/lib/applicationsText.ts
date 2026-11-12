/** Applications page types and text lookup, safe for client components (no file system). */
import type { Img } from "@/lib/products";

/** Localized text: one string per locale (fa, en, tr). */
export type L = Record<string, string>;
export type IndustryId = "cosmetics" | "hygiene" | "pharma" | "food" | "industrial";
export const INDUSTRY_IDS: IndustryId[] = ["cosmetics", "hygiene", "pharma", "food", "industrial"];

type Point = { title: L; text: L };
export type Industry = {
  id: IndustryId;
  name: L;
  label: L;
  title: L;
  lead: L;
  /** The long text merged from the old industry page, always in the HTML (SEO). */
  body: L;
  image: Img;
  accent: string;
  needs: Point[];
  solutions: Point[];
  examples: L[];
  /** Configurator query (shape, cap, print) the "design a tube" link opens with. */
  configure: string;
  more?: { label: L; href: string };
};
export type FinderContent = { id: string; label: L; closures: string[]; note: L; more?: { label: L; href: string } };
export type FinderPriority = { id: string; label: L; structure: L; print: string[] };
export type Spot = { id: string; x: number; y: number; title: L; text: L; link?: { label: L; href: string } };
export type Project = { id: string; industry: IndustryId; image: Img; title: L; text: L; specs: { label: L; value: L }[] };
export type FaqItem = { industries: IndustryId[]; q: L; a: L };

export type Applications = {
  meta: { title: L; description: L };
  hero: { eyebrow: L; title: L; lead: L; explore: L; finder: L; industriesLabel: L };
  industries: { eyebrow: L; title: L; lead: L; tabsLabel: L; needsLabel: L; solutionsLabel: L; examplesLabel: L; configure: L; quote: L; readMore: L; items: Industry[] };
  finder: {
    eyebrow: L;
    title: L;
    lead: L;
    industry: L;
    content: L;
    priority: L;
    result: L;
    structureLabel: L;
    closuresLabel: L;
    printLabel: L;
    sendLabel: L;
    ask: L;
    configure: L;
    disclaimer: L;
    contents: FinderContent[];
    priorities: FinderPriority[];
    send: L[];
  };
  engineering: { eyebrow: L; title: L; lead: L; image: Img; imageAlt: L; spots: Spot[] };
  projects: { eyebrow: L; title: L; lead: L; all: L; close: L; prev: L; next: L; note: L; items: Project[] };
  quality: { eyebrow: L; title: L; lead: L; steps: Point[]; certificates: L };
  quote: { eyebrow: L; title: L; lead: L; form: string; department: string; sentTitle: L; numberLabel: L; followUp: L; again: L; fallback: L };
  faq: { eyebrow: L; title: L; all: L; items: FaqItem[] };
};

export const t = (text: L | null | undefined, locale: string) => (text ? (text[locale] ?? text.en ?? "") : "");

/** Events between the page's islands: pick an industry (hero, finder) or ask with finder answers. */
export const PICK_INDUSTRY = "applications:industry";
export const ASK_QUOTE = "applications:quote";
export type AskDetail = { industry?: string; contents?: string; priority?: string };
