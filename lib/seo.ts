import { contact, productPaths, siteUrl, social } from "@/lib/site";
import { defaultLocale, getDictionary, localeMeta, locales, type Dictionary, type Locale } from "@/lib/i18n";

export const pageUrl = (locale: Locale, path = "") => `${siteUrl}/${locale}${path}`;

/** hreflang map shared by <head> and the sitemap; x-default points at the Persian home. */
export const languageAlternates = (path = "") => ({
  ...Object.fromEntries(locales.map((l) => [l, pageUrl(l, path)])),
  "x-default": pageUrl(defaultLocale, path),
});

const productImages = ["/images/product-tube.webp", "/images/product-effervescent.webp"];

/** schema.org graph for the home page: who we are, the site, the page and what we make. */
export function homeJsonLd(t: Dictionary, locale: Locale) {
  const url = pageUrl(locale);
  const lang = localeMeta[locale].intl;
  const org = `${siteUrl}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: "Arapoush Gostar",
        alternateName: ["آراپوش گستر", "ARAPOUSH"],
        url: siteUrl,
        logo: `${siteUrl}/images/logo.png`,
        email: contact.email,
        telephone: contact.phone,
        address: {
          "@type": "PostalAddress",
          streetAddress: "No 3, Gooyabadi St, Zafar Ave",
          addressLocality: "Tehran",
          addressCountry: "IR",
        },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: contact.phone,
          email: contact.email,
          availableLanguage: ["fa", "en", "tr"],
        },
        sameAs: [social.instagram, social.linkedin],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: t.common.brand,
        inLanguage: locales.map((l) => localeMeta[l].intl),
        publisher: { "@id": org },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: t.meta.title,
        description: t.meta.description,
        inLanguage: lang,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": org },
        primaryImageOfPage: `${siteUrl}/images/hero-products.webp`,
      },
      {
        "@type": "ItemList",
        "@id": `${url}#products`,
        name: t.products.eyebrow,
        itemListElement: t.products.cards.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: c.title.join(" "),
            description: c.text,
            image: `${siteUrl}${productImages[i]}`,
            brand: { "@id": org },
            category: t.applications.items.map((a) => a.title).join(", "),
          },
        })),
      },
    ],
  };
}

/** Plain-text summaries for AI assistants and answer engines (llms.txt convention). */
export function llmsText(full: boolean) {
  const en = getDictionary("en");
  const lines = [
    "# Arapoush Gostar (آراپوش گستر)",
    "",
    `> ${en.meta.description}`,
    "",
    "Arapoush Gostar is a Tehran-based packaging manufacturer making multi-layered seamless plastic tubes and effervescent tablet tubes for cosmetic, pharmaceutical, hygienic and food brands. The site is published in Persian (default), English and Turkish.",
    "",
    "## Pages",
    ...locales.map((l) => `- [${getDictionary(l).meta.title}](${pageUrl(l)}): ${localeMeta[l].label} home page`),
    ...locales.map((l) => `- [${getDictionary(l).productTube.meta.title}](${pageUrl(l, productPaths.tube)}): ${getDictionary(l).productTube.meta.description}`),
    "",
    "## Contact",
    `- Email: ${contact.email}`,
    `- Phone: ${contact.phone}`,
    `- Address: ${contact.address.join(" ")}`,
    `- Instagram: ${social.instagram}`,
    `- LinkedIn: ${social.linkedin}`,
  ];
  if (!full) {
    lines.push("", "## Optional", `- [Full site text](${siteUrl}/llms-full.txt): every section of the home page in each language`);
    return lines.join("\n") + "\n";
  }
  for (const l of locales) {
    const t = getDictionary(l);
    lines.push(
      "",
      `## ${localeMeta[l].label} (${pageUrl(l)})`,
      "",
      `### ${t.products.eyebrow}`,
      t.products.lead,
      ...t.products.cards.map((c) => `- ${c.title.join(" ")}: ${c.text}`),
      "",
      `### ${t.applications.eyebrow}`,
      t.applications.lead,
      ...t.applications.items.map((a) => `- ${a.title}: ${a.text}`),
      "",
      `### ${t.partners.eyebrow}`,
      t.partners.lead.join(" "),
      "",
      `### ${t.certifications.eyebrow}`,
      t.certifications.lead,
      ...t.certifications.items.map((c, i) => `- ${["GMP", "ISO 9001", "IFDA", "INSO"][i]} (${c.name}): ${c.text}`),
      "",
      `### ${t.insights.eyebrow}`,
      ...t.insights.articles.map((a) => `- ${a.title}: ${a.text}`),
      "",
      `### ${t.productTube.title.join(" ")} (${pageUrl(l, productPaths.tube)})`,
      t.productTube.lead,
      ...t.productTube.features.map((f) => `- ${f}`),
      `${t.productTube.layers.title}: ${t.productTube.layers.items.map((x) => `${x.name} (${x.text})`).join("; ")}`,
      `${t.productTube.calculator.title}: V(ml) = π × (d/2)² × L / 1000 (d, L in mm; d = 19–60 mm, L = 50–300 mm). ${t.productTube.calculator.note}`,
      `${t.productTube.variants}: ${Object.values(t.productTube.shapes).join(", ")}. ${t.productTube.closures}: ${t.productTube.closureNames.join(", ")}.`,
      "",
      `### ${t.cta.title.join(" ")}`,
      t.cta.lead,
    );
  }
  return lines.join("\n") + "\n";
}

/** Product detail page: the product itself plus its breadcrumb trail. */
export function productTubeJsonLd(t: Dictionary, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const p = t.productTube;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: p.title.join(" "),
        description: p.lead,
        url,
        image: [`${siteUrl}/images/product-tube.webp`, `${siteUrl}/images/cta-tube.webp`],
        brand: { "@id": `${siteUrl}/#organization` },
        manufacturer: { "@id": `${siteUrl}/#organization` },
        material: "PE / EVOH multi-layer",
        additionalProperty: [
          { "@type": "PropertyValue", name: p.calculator.diameter, value: "19–60" },
          ...p.layers.items.map((l, i) => ({ "@type": "PropertyValue", name: `${p.layers.title} ${i + 1}`, value: `${l.name} — ${l.text}` })),
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: p.breadcrumb, item: `${pageUrl(locale)}#products` },
          { "@type": "ListItem", position: 3, name: p.title.join(" "), item: url },
        ],
      },
    ],
  };
}
