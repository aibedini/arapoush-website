import { isBlockKind, pickL, type LayoutSection } from "@arapoush/schema";
import { entry } from "@/lib/content";
import { pageForms } from "@/lib/content/forms";
import { formPath } from "@/lib/forms";
import { applicationsPath, printingPath, productPaths, siteUrl } from "@/lib/site";
import { getPrinting, t as pt, type Printing } from "@/lib/printing";
import { getApplications, type Applications } from "@/lib/applications";
import { getAbout, type About } from "@/lib/about";
import { aboutPath, contactPath } from "@/lib/site";
import { getContactPage, mapLinks, telHref, type Contact } from "@/lib/contact";
import { getEffervescentProduct, getTubeProduct, type EffProduct } from "@/lib/products";
import { diametersFor, loc, type TubeProduct } from "@/lib/configurator/model";
import { defaultLocale, getDictionary, localeMeta, locales, type Dictionary, type Locale } from "@/lib/i18n";

export const pageUrl = (locale: Locale, path = "") => `${siteUrl}/${locale}${path}`;

/** hreflang map shared by <head> and the sitemap; x-default points at the Persian home. */
export const languageAlternates = (path = "") => ({
  ...Object.fromEntries(locales.map((l) => [l, pageUrl(l, path)])),
  "x-default": pageUrl(defaultLocale, path),
});

/** schema.org graph for the home page: who we are, the site, the page and what we make. */
export function homeJsonLd(t: Dictionary, locale: Locale) {
  const { contact, social } = t.site;
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
        logo: `${siteUrl}${t.media.site.logo.src}`,
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
        primaryImageOfPage: `${siteUrl}${t.media.hero.slides[0]?.product?.src ?? t.media.site.og.src}`,
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
            image: `${siteUrl}${t.media.products.cards[i]?.image.src ?? t.media.site.og.src}`,
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
  const { contact, social } = en.site;
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
    ...locales.map((l) => `- [${pt(getApplications().meta.title, l)}](${pageUrl(l, applicationsPath)}): ${pt(getApplications().meta.description, l)}`),
    ...locales.map((l) => `- [${pt(getAbout().meta.title, l)}](${pageUrl(l, aboutPath)}): ${pt(getAbout().meta.description, l)}`),
    ...locales.map((l) => `- [${pt(getContactPage().meta.title, l)}](${pageUrl(l, contactPath)}): ${pt(getContactPage().meta.description, l)}`),
    ...pageForms()
      .filter((f) => f.page.indexable)
      .flatMap((f) => locales.map((l) => `- [${pickL(f.page.title, l) || pickL(f.title, l)}](${pageUrl(l, formPath(f.slug))}): ${pickL(f.page.description, l) || pickL(f.intro, l) || "Request form"}`)),
    "",
    "## Contact",
    `- Email: ${contact.email}`,
    `- Phone: ${contact.phone}`,
    `- Address: ${contact.address.join(" ")}`,
    `- Instagram: ${social.instagram}`,
    `- LinkedIn: ${social.linkedin}`,
    ...contactLines(getContactPage(), "en"),
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
      ...blockFacts(l),
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
      ...applicationsFacts(getApplications(), l),
      "",
      ...aboutFacts(getAbout(), l),
      "",
      ...contactFacts(getContactPage(), l),
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
    ...p.closures.flatMap((k) =>
      Object.entries(k.colours ?? {}).map(([shape, byD]) => `  - ${loc(k.name, l)} (${loc(p.shapes.find((x) => x.id === shape)?.name, l)}): ${Object.entries(byD).map(([d, ids]) => `Ø${d}: ${ids.map((id) => loc(p.colourFamilies?.find((f) => f.id === id)?.name, l)).join("/")}`).join("; ")}`),
    ),
    ...(p.prints?.length ? [`- ${c.printMethod}: ${p.prints.map((x) => `${loc(x.name, l)}${x.note ? ` (${loc(x.note, l)})` : ""}`).join("; ")}`] : []),
    ...(p.bodyColours?.length ? [`- ${c.bodyColour}: ${p.bodyColours.map((b) => loc(b.name, l)).join(", ")}`] : []),
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
        // Sizes as one line per shape and diameter (lengths and volumes): the full size chart without
        // a variant per row, which would double the page weight (it travels in the HTML and the RSC payload).
        "@type": "Product",
        "@id": `${url}#product`,
        size: product.shapes.flatMap((sh) =>
          diametersFor(product, sh.id).map((d) => {
            const rows = sh.sizes[String(d)] ?? [];
            const ml = rows.filter((r) => r.ml).map((r) => r.ml!);
            return `${loc(sh.name, locale)} Ø${d}: ${rows.map((r) => r.l).join("/")} mm${ml.length ? ` (${Math.min(...ml)}–${Math.max(...ml)} ml)` : ""}`;
          }),
        ),
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
          ...(product.colourFamilies?.length ? [{ "@type": "PropertyValue", name: p.configurator.capColour, value: product.colourFamilies.map((f) => loc(f.name, locale)).join(", ") }] : []),
          ...(product.prints?.length ? [{ "@type": "PropertyValue", name: p.configurator.printMethod, value: product.prints.map((x) => loc(x.name, locale)).join(", ") }] : []),
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
        primaryImageOfPage: `${siteUrl}${t.media.printing.tubeGold.src}`,
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

/**
 * Applications page: each industry as a solution Arapoush offers (with its typical products), the
 * FAQ as a FAQPage, and the breadcrumb trail.
 */
export function applicationsJsonLd(t: Dictionary, a: Applications, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const tx = (v: Record<string, string>) => pt(v, locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: tx(a.meta.title),
        description: tx(a.meta.description),
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        primaryImageOfPage: `${siteUrl}${a.industries.items[0]?.image.src ?? ""}`,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: a.industries.items.map((x, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Service",
              "@id": `${url}#${x.id}`,
              name: `${tx(x.name)}: ${tx(x.title)}`,
              description: tx(x.body),
              serviceType: tx(x.name),
              audience: { "@type": "BusinessAudience", name: tx(x.name) },
              provider: { "@id": `${siteUrl}/#organization` },
              image: `${siteUrl}${x.image.src}`,
              category: x.examples.map(tx),
            },
          })),
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: a.faq.items.map((f) => ({ "@type": "Question", name: tx(f.q), acceptedAnswer: { "@type": "Answer", text: tx(f.a) } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: tx(a.industries.title), item: url },
        ],
      },
    ],
  };
}

/** About page: Arapoush as an organisation with its founding, honours and credentials. */
export function aboutJsonLd(t: Dictionary, a: About, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const tx = (v: Record<string, string> | null | undefined) => pt(v, locale);
  const abs = (src: string) => (src.startsWith("http") ? src : `${siteUrl}${src}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${url}#page`,
        url,
        name: tx(a.meta.title),
        description: tx(a.meta.description),
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
        primaryImageOfPage: abs(a.gallery.items[0]?.image.src ?? t.media.about.poster.src),
        image: a.gallery.items.map((g) => abs(g.image.src)),
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        foundingDate: "2004",
        foundingLocation: { "@type": "Place", name: "Caspian Industrial Town, Qazvin, Iran" },
        slogan: tx(a.hero.slogan),
        award: a.honours.items.filter((h) => h.kind === "award").map((h) => [tx(h.title), tx(h.year)].filter(Boolean).join(", ")),
        hasCredential: a.honours.items
          .filter((h) => h.kind !== "award")
          .map((h) => ({
            "@type": "EducationalOccupationalCredential",
            name: tx(h.title),
            description: tx(h.scope),
            credentialCategory: h.kind === "certificate" ? "certificate" : "license",
            recognizedBy: { "@type": "Organization", name: tx(h.issuer) },
            image: abs(h.image.src),
          })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: tx(a.meta.title), item: url },
        ],
      },
    ],
  };
}

/** Departments with their lines, extensions and mobiles, and both sites with their addresses. */
function contactLines(c: Contact, l: Locale) {
  return [
    ...c.directory.departments.map(
      (d) =>
        `- ${pt(d.name, l)}: ${d.phones.join(", ")}${d.email ? `, ${d.email}` : ""}` +
        d.people.map((m) => `; ${pt(m.name, l)} (${pt(m.role, l)}${m.exts.length ? `, ext. ${m.exts.join("/")}` : ""}${m.mobiles?.length ? `, mobile ${m.mobiles.join(" / ")}` : ""})`).join(""),
    ),
    ...c.locations.places.map((p) => `- ${pt(p.name, l)}: ${pt(p.address, l)}${p.postalCode ? ` (postal code ${p.postalCode})` : ""}; ${p.phones.join(", ")}${p.fax ? `; fax ${p.fax}` : ""}; directions: ${mapLinks(p, l).map((m) => m.href).join(" ")}`),
  ];
}

/** The contact page as plain lines: departments, sites, open roles and every FAQ answer. */
function contactFacts(c: Contact, l: Locale) {
  return [
    `### ${pt(c.hero.title, l)} (${pageUrl(l, contactPath)})`,
    pt(c.hero.lead, l),
    ...contactLines(c, l),
    ...c.careers.openings.map((o) => `- ${pt(c.careers.title, l)}: ${pt(o.title, l)} (${pt(o.location, l)}, ${pt(o.type, l)}). ${pt(o.text, l)}`),
    "",
    `#### ${pt(c.faq.title, l)}`,
    ...c.faq.groups.flatMap((g) => g.items.map((q) => `- ${pt(q.q, l)} ${pt(q.a, l)}`)),
  ];
}

export function contactJsonLd(t: Dictionary, c: Contact, locale: Locale, path: string) {
  const url = pageUrl(locale, path);
  const tx = (v: Record<string, string>) => pt(v, locale);
  const org = `${siteUrl}/#organization`;
  const intl = (n: string) => telHref(n).replace("tel:", "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": `${url}#page`,
        url,
        name: tx(c.meta.title),
        description: tx(c.meta.description),
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": org },
        primaryImageOfPage: `${siteUrl}${t.media.contact.hero.src}`,
      },
      {
        "@type": "Organization",
        "@id": org,
        contactPoint: c.directory.departments.map((d) => ({
          "@type": "ContactPoint",
          contactType: tx(d.name),
          telephone: d.phones[0] ? intl(d.phones[0]) : undefined,
          email: d.email || undefined,
          availableLanguage: ["fa", "en", "tr"],
        })),
        location: c.locations.places.map((p) => ({
          "@type": "Place",
          "@id": `${url}#${p.id}`,
          name: tx(p.name),
          address: { "@type": "PostalAddress", streetAddress: tx(p.address), postalCode: p.postalCode || undefined, addressCountry: "IR" },
          telephone: p.phones[0] ? intl(p.phones[0]) : undefined,
          faxNumber: p.fax ? intl(p.fax) : undefined,
          ...(typeof p.geo.lat === "number" && typeof p.geo.lng === "number" ? { geo: { "@type": "GeoCoordinates", latitude: p.geo.lat, longitude: p.geo.lng } } : {}),
          hasMap: mapLinks(p, locale)[0]?.href,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: locale,
        mainEntity: c.faq.groups.flatMap((g) => g.items.map((q) => ({ "@type": "Question", name: tx(q.q), acceptedAnswer: { "@type": "Answer", text: tx(q.a) } }))),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t.common.brand, item: pageUrl(locale) },
          { "@type": "ListItem", position: 2, name: tx(c.hero.title), item: url },
        ],
      },
    ],
  };
}

/** The about page as plain lines: milestones, today's scale and every honour. */
function aboutFacts(a: About, l: Locale) {
  return [
    `### ${pt(a.hero.title, l)} (${pageUrl(l, aboutPath)})`,
    pt(a.hero.lead, l),
    `Slogan: ${pt(a.hero.slogan, l)}`,
    ...a.story.milestones.map((m) => `- ${pt(m.year, l)}: ${pt(m.title, l)}. ${pt(m.text, l)}`),
    `- ${pt(a.story.today.unit, l)}`,
    ...a.story.today.items.map((x) => `- ${pt(x, l)}`),
    "",
    `#### ${pt(a.honours.title, l)}`,
    ...a.honours.items.map(
      (h) => `- ${pt(h.title, l)}${h.year ? ` (${pt(h.year, l)})` : ""}. ${pt(a.honours.issuer, l)}: ${pt(h.issuer, l)}. ${pt(a.honours.scope, l)}: ${pt(h.scope, l)}. ${pt(h.text, l)}`,
    ),
  ];
}

/** Every industry with its needs, the Arapoush answer and typical products, then the FAQ. */
function applicationsFacts(a: Applications, l: Locale) {
  const tx = (v: Record<string, string>) => pt(v, l);
  return [
    `### ${tx(a.hero.title)} (${pageUrl(l, applicationsPath)})`,
    tx(a.hero.lead),
    ...a.industries.items.flatMap((x) => [
      `#### ${tx(x.name)}: ${tx(x.title)} (${pageUrl(l, applicationsPath)}#${x.id})`,
      tx(x.body),
      ...x.needs.map((n) => `- ${tx(n.title)}: ${tx(n.text)}`),
      ...x.solutions.map((s) => `- ${tx(s.title)}: ${tx(s.text)}`),
      `- ${tx(a.industries.examplesLabel)}: ${x.examples.map(tx).join(", ")}`,
    ]),
    `#### ${tx(a.faq.title)}`,
    ...a.faq.items.map((f) => `- ${tx(f.q)} ${tx(f.a)}`),
  ];
}

/** Every printing method with its process and capabilities, as plain lines. */
function printingFacts(p: Printing, l: Locale) {
  return [
    `### ${pt(p.hero.title, l)} (${pageUrl(l, printingPath)})`,
    pt(p.hero.lead, l),
    ...p.tech.items.flatMap((m) => [`- ${pt(m.name, l)}: ${pt(m.summary, l)} ${pt(m.process, l)}`, ...m.capabilities.map((c) => `  - ${pt(c, l)}`)]),
  ];
}

/** Text of the page-builder blocks on the home page (P12), for llms-full.txt. */
function blockFacts(l: Locale) {
  const sections = entry<{ sections?: LayoutSection[] }>("page.home.layout")?.sections ?? [];
  return sections
    .filter((s) => s.enabled && isBlockKind(s.type) && s.type !== "spacer" && s.type !== "form")
    .flatMap((s) => {
      const p = s.props ?? {};
      const title = pickL(p.title, l);
      const lines = [title ? `### ${title}` : "", pickL(p.body, l), ...(p.items ?? []).map((it) => (pickL(it.q, l) ? `- ${pickL(it.q, l)} ${pickL(it.a, l)}` : ""))].filter(Boolean);
      return lines.length ? [...lines, ""] : [];
    });
}
