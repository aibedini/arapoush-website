import { contact, printingPath, productPaths, siteUrl, social } from "@/lib/site";
import { getPrinting, t as pt, type Printing } from "@/lib/printing";
import { getEffervescentProduct, getTubeProduct, type EffProduct } from "@/lib/products";
import { diametersFor, loc, type TubeProduct } from "@/lib/configurator/model";
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
    ...locales.map((l) => `- [${getDictionary(l).productEff.meta.title}](${pageUrl(l, productPaths.effervescent)}): ${getDictionary(l).productEff.meta.description}`),
    ...locales.map((l) => `- [${pt(getPrinting().meta.title, l)}](${pageUrl(l, printingPath)}): ${pt(getPrinting().meta.description, l)}`),
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
      ...tubeFacts(t, getTubeProduct(), l),
      "",
      ...effFacts(t, getEffervescentProduct(), l),
      "",
      ...printingFacts(getPrinting(), l),
      "",
      `### ${t.cta.title.join(" ")}`,
      t.cta.lead,
    );
  }
  return lines.join("\n") + "\n";
}

/** Every shape, size, volume, closure and structure from the admin-managed product content, as plain lines. */
function tubeFacts(t: Dictionary, p: TubeProduct, l: Locale) {
  const c = t.productTube.configurator;
  return [
    `${c.title} (${pageUrl(l, productPaths.tube)}#configurator): ${c.lead} ${c.disclaimer}`,
    ...p.shapes.map(
      (s) =>
        `- ${c.shape}: ${loc(s.name, l)} — ` +
        diametersFor(p, s.id)
          .map((d) => `Ø${d} mm: ${s.sizes[String(d)]!.map((r) => (r.ml ? `${r.l} mm = ${r.ml} ml` : `${r.l} mm`)).join(", ")}`)
          .join("; "),
    ),
    `- ${c.closure}: ${p.closures.map((k) => loc(k.name, l)).join(", ")}`,
    ...p.structures.map((s) => `- ${c.specStructure}: ${loc(s.name, l)} — ${s.layers.map((x) => `${loc(x.name, l)} (${loc(x.text, l)})`).join("; ")}`),
  ];
}

/** Product detail page: the product itself plus its breadcrumb trail. */
export function productTubeJsonLd(t: Dictionary, product: TubeProduct, locale: Locale, path: string) {
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
        image: [product.images.hero.ltr, product.images.layers.ltr, ...product.shapes.map((s) => s.image)].map((src) => `${siteUrl}${src}`),
        brand: { "@id": `${siteUrl}/#organization` },
        manufacturer: { "@id": `${siteUrl}/#organization` },
        material: product.structures.map((s) => loc(s.name, "en")).join("; "),
        additionalProperty: [
          ...product.shapes.map((s) => ({ "@type": "PropertyValue", name: `${p.configurator.shape}: ${loc(s.name, locale)}`, value: `Ø ${diametersFor(product, s.id).join(", ")} mm` })),
          { "@type": "PropertyValue", name: p.configurator.closure, value: product.closures.map((k) => loc(k.name, locale)).join(", ") },
          ...(product.structures[0]?.layers ?? []).map((l, i) => ({ "@type": "PropertyValue", name: `${p.layers.title} ${i + 1}`, value: `${loc(l.name, locale)} — ${loc(l.text, locale)}` })),
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

/** Effervescent tube page as plain text: sizes, caps, uses and the published production figures. */
function effFacts(t: Dictionary, p: EffProduct, l: Locale) {
  const e = t.productEff;
  const url = pageUrl(l, productPaths.effervescent);
  return [
    `### ${e.eyebrow} (${url})`,
    `${e.title.join(" ")} ${e.lead}`,
    `- ${e.sizes.title}: ${p.sizes.map((s) => `Ø${s.d} × ${s.h} mm`).join(", ")}. ${e.sizes.lead}`,
    `- ${e.caps.title}: ${p.caps.variants.map((v) => v.name[l] ?? v.name.en).join(", ")}. ${e.caps.facts.join("; ")}.`,
    ...e.story.map((s) => `- ${s.title}: ${s.text}`),
    `- ${e.uses.title}: ${e.uses.lead} ${e.uses.items.map((i) => `${i.title} (${i.text})`).join("; ")}`,
    `- ${e.make.title}: ${e.make.lead.replace("{since}", p.since[l] ?? p.since.en!)} ${p.dailyCapacity} ${e.make.perDay}. ${e.make.standards}`,
  ];
}

/** Effervescent tube page: the product, its five standard sizes as variants, and the breadcrumb trail. */
export function productEffJsonLd(t: Dictionary, product: EffProduct, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const e = t.productEff;
  const id = `${url}#product`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProductGroup",
        "@id": id,
        name: e.eyebrow,
        description: `${e.lead} ${e.caps.lead}`,
        url,
        image: [product.images.usesPhoto.src, product.images.uses.src, ...product.caps.variants.map((v) => v.image.src)].map((src) => `${siteUrl}${src}`),
        brand: { "@id": `${siteUrl}/#organization` },
        manufacturer: { "@id": `${siteUrl}/#organization` },
        variesBy: ["https://schema.org/size"],
        additionalProperty: [
          { "@type": "PropertyValue", name: e.caps.label, value: product.caps.variants.map((v) => v.name[locale] ?? v.name.en).join(", ") },
          ...e.caps.facts.map((f) => ({ "@type": "PropertyValue", name: e.caps.title, value: f })),
        ],
        hasVariant: product.sizes.map((s) => ({
          "@type": "Product",
          name: `${e.eyebrow} Ø${s.d} × ${s.h} mm`,
          size: `Ø${s.d} × ${s.h} mm`,
          width: { "@type": "QuantitativeValue", value: s.d, unitCode: "MMT" },
          height: { "@type": "QuantitativeValue", value: s.h, unitCode: "MMT" },
          image: `${siteUrl}${s.render.src}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: e.breadcrumb, item: `${pageUrl(locale)}#products` },
          { "@type": "ListItem", position: 3, name: e.eyebrow, item: url },
        ],
      },
    ],
  };
}

/** Printing page: the five methods as services Arapoush offers, plus the breadcrumb trail. */
export function printingJsonLd(t: Dictionary, p: Printing, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const tx = (v: Record<string, string>) => pt(v, locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: tx(p.meta.title),
        description: tx(p.meta.description),
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        primaryImageOfPage: `${siteUrl}/images/printing/tube-gold.webp`,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: p.tech.items.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Service",
              "@id": `${url}#${m.id}`,
              name: tx(m.name),
              description: `${tx(m.summary)} ${tx(m.process)}`,
              serviceType: tx(m.name),
              provider: { "@id": `${siteUrl}/#organization` },
              image: `${siteUrl}${m.macro.src}`,
            },
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: tx(p.hero.title), item: url },
        ],
      },
    ],
  };
}

/** Every printing method with its process and capabilities, as plain lines. */
function printingFacts(p: Printing, l: Locale) {
  return [
    `### ${pt(p.hero.title, l)} (${pageUrl(l, printingPath)})`,
    pt(p.hero.lead, l),
    ...p.tech.items.flatMap((m) => [`- ${pt(m.name, l)}: ${pt(m.summary, l)} ${pt(m.process, l)}`, ...m.capabilities.map((c) => `  - ${pt(c, l)}`)]),
  ];
}
