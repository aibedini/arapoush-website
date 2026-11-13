// Navigation labels and targets live in the locale dictionaries (lib/i18n).

// Canonical origin for metadata, hreflang, sitemap and structured data. Set NEXT_PUBLIC_SITE_URL per deploy.
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://arapoush.com").replace(/\/$/, "");

// Detail pages are not part of this design yet. Cards point at the quote form
// until real URLs exist; `null` renders the element without a link.
// Product detail pages, relative to the locale root (/fa, /en, /tr).
export const productPaths = {
  tube: "/products/multi-layer-tube",
  effervescent: "/products/effervescent-tube",
} as const;

/** Printing technologies landing page (the header's "Printing" item), relative to the locale root. */
export const printingPath = "/printing";

/** About Arapoush: story, factory and honours (the header's "About" item), relative to the locale root. */
export const aboutPath = "/about";

/** Applications by industry: cosmetic, hygiene, pharmaceutical, food and industrial (the header's "Applications"). */
export const applicationsPath = "/applications";

/** Contact page: departments, locations, request, careers, feedback and FAQ (the header's "Contact"). */
export const contactPath = "/contact";

/**
 * Section anchors work from any page: on a sub-page they point back to the localized home. Site paths
 * without a locale (`/applications`) get the visitor's locale, so en/tr visitors stay in their language
 * instead of being redirected to the Persian site (SEO audit: internal links lost their locale).
 */
export const homeHref = (locale: string, href: string, onHome: boolean) => {
  if (href.startsWith("#")) return onHome ? href : `/${locale}${href === "#top" ? "" : href}`;
  return localeHref(locale, href);
};

/** `/x` → `/{locale}/x`; already localized paths, files, media and external links stay as they are. */
export const localeHref = (locale: string, href: string) =>
  href.startsWith("/") && !href.startsWith("//") && !/^\/(fa|en|tr)(\/|$|#|\?)/.test(href) && !/^\/(media|images|files|api)\//.test(href) ? `/${locale}${href === "/" ? "" : href}` : href;

export const links = {
  products: { tube: productPaths.tube as string, effervescent: productPaths.effervescent as string },
  applications: applicationsPath as string,
  articles: null as string | null,
  allArticles: null as string | null,
  // Set to "/files/arapoush-catalog.pdf" once the real catalog is in public/files (a missing file is a
  // broken link on every page; null renders the row without a link).
  brochure: null as string | null,
  certificates: null as string | null,
};

// TODO(client): confirm the official profile URLs.
export const social = {
  instagram: "https://www.instagram.com/arapoush",
  linkedin: "https://www.linkedin.com/company/arapoush",
};

/** Contact details as components take them (from OPEX global.site, or the defaults below). */
export type Contact = { office: string; address: readonly string[]; phone: string; phoneHref: string; email: string };

export const contact = {
  office: "Tehran Office",
  address: ["No3,Gooyabadi St,Zafar Ave,", "Tehran,Iran"],
  phone: "+98 21 2642 1602",
  phoneHref: "tel:+982126421602",
  email: "sales@arapoush.com",
} as const;
