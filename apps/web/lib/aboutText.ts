/** About page types and text lookup, safe for client components (no file system). */
import type { Img } from "@/lib/content/pick";

/** Localized text: one string per locale (fa, en, tr). */
export type L = Record<string, string>;

export type HeroStyle = "cinema" | "split";
export type StoryStyle = "pinned" | "vertical";
export type GalleryStyle = "filmstrip" | "mosaic";
export type HonoursStyle = "wall" | "list";
export type HonourKind = "certificate" | "licence" | "award";

export type AboutHero = {
  style: HeroStyle;
  eyebrow: L;
  title: L;
  lead: L;
  slogan: L;
  story: L;
  honours: L;
  play: L;
  pause: L;
  videoAlt: L;
  stats: { id: string; value: L; label: L }[];
  video: { mp4: string; webm?: string | null };
};

export type Milestone = { id: string; year: L; title: L; text: L; image?: Img | null };
export type AboutStory = {
  style: StoryStyle;
  eyebrow: L;
  title: L;
  lead: L;
  milestones: Milestone[];
  today: { eyebrow: L; title: L; value: L; unit: L; items: L[] };
};

export type GalleryItem = { id: string; image: Img; caption: L };
export type AboutGallery = { style: GalleryStyle; eyebrow: L; title: L; lead: L; of: L; prev: L; next: L; items: GalleryItem[] };

export type Honour = { id: string; kind: HonourKind; title: L; year: L | null; issuer: L; scope: L; text: L; image: Img; copies: Img[] };
export type AboutHonours = {
  style: HonoursStyle;
  eyebrow: L;
  title: L;
  lead: L;
  filters: Record<"all" | HonourKind, L>;
  filterLabel: L;
  issuer: L;
  year: L;
  scope: L;
  view: L;
  close: L;
  copies: L;
  of: L;
  prev: L;
  next: L;
  items: Honour[];
};

export type About = { meta: { title: L; description: L }; hero: AboutHero; story: AboutStory; gallery: AboutGallery; honours: AboutHonours };

export const t = (text: L | null | undefined, locale: string) => (text ? (text[locale] ?? text.en ?? "") : "");
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
