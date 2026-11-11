/** Printing page types and text lookup, safe for client components (no file system). */
import type raw from "@/content/printing.json";
import type { Img } from "@/lib/products";

/** Localized text: one string per locale (fa, en, tr). */
export type L = Record<string, string>;
export type TechId = "flexo" | "offset" | "silk" | "hotstamp" | "combination";

export type Tech = {
  id: TechId;
  card: Img;
  macro: Img;
  sample: string;
  name: L;
  short: L;
  summary: L;
  advantages: L[];
  process: L;
  capabilities: L[];
  uses: L;
};

export type Effect = { m: TechId; s?: number; why: L };
export type GuideOption = { id: string; label: L; effects?: Effect[]; excludes?: Effect[]; asks?: Effect[]; note?: L };
export type GuideQuestion = { id: string; multi?: boolean; label: L; options: GuideOption[] };

export type Sample = { id: string; method: TechId; image: Img; title: L; industry: L; text: L };
export type Download = { id: string; format: string; file: string | null; name: L; text: L; size?: number };

type Raw = typeof raw;
export type Printing = Omit<Raw, "tech" | "guide" | "samples" | "downloads" | "compare"> & {
  tech: Omit<Raw["tech"], "items"> & { items: Tech[] };
  guide: Omit<Raw["guide"], "questions"> & { questions: GuideQuestion[] };
  samples: Omit<Raw["samples"], "items"> & { items: Sample[] };
  downloads: Omit<Raw["downloads"], "items"> & { items: Download[] };
  compare: Omit<Raw["compare"], "rows"> & { rows: Record<TechId, Record<string, L | null>> };
};

export const t = (text: L | null | undefined, locale: string) => (text ? (text[locale] ?? text.en ?? "") : "");
