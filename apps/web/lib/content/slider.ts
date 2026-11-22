import { pickLocale, sliderOf, SLIDER_DEFAULTS, type FontSettings, type Slide, type SliderSettings } from "@arapoush/schema";
import type { Locale } from "@/lib/i18n/config";
import { entryOrSnapshot } from "./index";

/**
 * The home slider for one locale: stored slides (slider builder) or, for entries made before it,
 * the designed slides read into the same model. Localized texts are already picked (strings), and
 * the right-to-left background replaces the desktop one in Persian.
 */
export type HeroSlider = { settings: Required<SliderSettings>; slides: Slide[] };

export function getSlider(locale: Locale): HeroSlider {
  const raw = sliderOf(entryOrSnapshot<Parameters<typeof sliderOf>[0]>("page.home.hero"));
  const picked = pickLocale<typeof raw>(raw, locale);
  const slides = (picked.slides ?? [])
    .filter((s) => s.enabled !== false)
    .map((s) => (locale === "fa" && s.background?.imageRtl ? { ...s, background: { ...s.background, image: s.background.imageRtl } } : s));
  return { settings: { ...SLIDER_DEFAULTS, ...stripEmpty(picked.settings ?? {}) }, slides };
}

/** Uploaded fonts and the per-language / per-section choices (`global.site` → `fonts`). */
export function getFonts(): FontSettings | undefined {
  return entryOrSnapshot<{ fonts?: FontSettings }>("global.site")?.fonts;
}

const stripEmpty = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
