import { pickLocale } from "@arapoush/schema";
import type { Locale } from "@/lib/i18n/config";
import { entryOrSnapshot } from "./index";

import type { Img } from "./pick";

export type { Img };
export { byId } from "./pick";
type WithId<T> = T & { id: string };

/**
 * Every image the shared layout and the home sections show, from content (OPEX or the snapshot).
 * Per-locale variants (Persian artwork) are already picked, so components never switch on locale.
 */
export type Media = {
  site: { logo: Img; logoWhite: Img; og: Img; footerBg: Img; ctaBg: Img; ctaTube: Img };
  hero: { slides: WithId<{ tone: "light" | "dark"; background: Img; backgroundMobile?: Img; product?: Img }>[] };
  products: { cards: WithId<{ image: Img }>[]; tablets: Img };
  applications: { items: WithId<{ image: Img }>[] };
  insights: { articles: WithId<{ image: Img }>[] };
  partners: { background: Img; logos: WithId<{ name: string; image: Img }>[] };
  certifications: { background: Img; seals: WithId<{ image: Img }>[] };
  printing: { bgLight: Img; bgNavy: Img; tubeColour: Img; tubeGold: Img; layers: Img; ctaTube: Img };
  about: { poster: Img };
  contact: { hero: Img; places: WithId<{ image: Img }>[] };
};

type HeroSlideRaw = { id: string; tone: "light" | "dark"; background: Img; backgroundRtl?: Img; backgroundMobile?: Img; product?: Img };

const images = <T,>(type: string, locale: Locale) => pickLocale<{ images: T }>(entryOrSnapshot<{ images: unknown }>(type), locale).images;

export function getMedia(locale: Locale): Media {
  const hero = images<{ slides: HeroSlideRaw[] }>("page.home.hero", locale);
  return {
    site: images("global.site", locale),
    hero: {
      // A right-to-left variant of a background replaces it in Persian.
      slides: hero.slides.map(({ backgroundRtl, ...s }: HeroSlideRaw) => ({ ...s, background: locale === "fa" && backgroundRtl ? backgroundRtl : s.background })),
    },
    products: images("page.home.products", locale),
    applications: images("page.home.applications", locale),
    insights: images("page.home.insights", locale),
    partners: images("page.home.partners", locale),
    certifications: images("page.home.certifications", locale),
    printing: images("page.printing", locale),
    about: images("page.about", locale),
    contact: images("page.contact", locale),
  };
}

