import { pickLocale } from "@arapoush/schema";
import { entry } from "@/lib/content";
import { overlay } from "@/lib/content/overlay";
import { getMedia, type Media } from "@/lib/content/media";
import { contact as fileContact, links as fileLinks, social as fileSocial } from "@/lib/site";
import type { Locale } from "./config";
import en, { type Dictionary as Copy } from "./dictionaries/en";
import fa from "./dictionaries/fa";
import tr from "./dictionaries/tr";

const dictionaries: Record<Locale, Copy> = { fa, en, tr };

/** Contact details, social profiles and file links (`global.site`), editable in OPEX. */
export type SiteSettings = {
  contact: { office: string; address: string[]; phone: string; phoneHref: string; email: string };
  social: { instagram: string; linkedin: string };
  links: typeof fileLinks;
};

/** Everything a page renders for one locale: copy, images and site settings. */
export type Dictionary = Copy & { media: Media; site: SiteSettings };

/** Content types whose top-level keys are dictionary sections (meta, hero, productEff, …). */
const COPY_TYPES = ["global.site", "page.home.hero", "page.home.products", "page.home.applications", "page.home.insights", "page.home.partners", "page.home.certifications", "product.tube.page", "product.effervescent.page"];

function siteSettings(locale: Locale): SiteSettings {
  const s = entry<{ contact?: unknown; social?: unknown; links?: { brochure?: string | null } }>("global.site");
  return {
    contact: overlay({ ...fileContact, address: [...fileContact.address] }, s ? pickLocale(s.contact, locale) : undefined),
    social: overlay({ ...fileSocial }, s?.social),
    links: { ...fileLinks, brochure: s?.links && "brochure" in s.links ? (s.links.brochure ?? null) : fileLinks.brochure },
  };
}

/**
 * The page dictionary. Call `await ensureContent()` (lib/content) earlier in the request so
 * OPEX content is loaded; without OPEX it is exactly the code dictionaries.
 */
export function getDictionary(locale: Locale): Dictionary {
  let copy: Copy = dictionaries[locale];
  for (const type of COPY_TYPES) {
    const data = entry(type);
    if (data) copy = overlay(copy, pickLocale(data, locale));
  }
  return { ...copy, media: getMedia(locale), site: siteSettings(locale) };
}

export * from "./config";
