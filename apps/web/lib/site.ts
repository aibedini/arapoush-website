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

/** Contact page: departments, locations, request, careers, feedback and FAQ (the header's "Contact"). */
export const contactPath = "/contact";

/** Section anchors work from any page: on a sub-page they point back to the localized home. */
export const homeHref = (locale: string, href: string, onHome: boolean) =>
  href.startsWith("#") && !onHome ? `/${locale}${href === "#top" ? "" : href}` : href;

export const links = {
  products: { tube: productPaths.tube as string, effervescent: productPaths.effervescent as string },
  applications: "#contact",
  articles: null as string | null,
  allArticles: null as string | null,
  // Drop the real catalog at public/files/arapoush-catalog.pdf.
  brochure: "/files/arapoush-catalog.pdf" as string | null,
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
