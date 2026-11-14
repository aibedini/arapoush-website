import { ensureContent, lastPublished } from "@/lib/content";
import type { MetadataRoute } from "next";
import { getDictionary, locales } from "@/lib/i18n";
import { getPrinting } from "@/lib/printing";
import { getApplications } from "@/lib/applications";
import { getAbout } from "@/lib/about";
import { aboutPath, contactPath } from "@/lib/site";
import { getEffervescentProduct, getTubeProduct } from "@/lib/products";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { applicationsPath, printingPath, productPaths, siteUrl } from "@/lib/site";
import { pageForms } from "@/lib/content/forms";
import { formPath } from "@/lib/forms";
import { authorPath, blogPath, categoryPath, getBlogIndex, pagePath, PER_PAGE } from "@/lib/blog";
import { postAlternates } from "@/lib/blogSeo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureContent();
  // Key images per page come from content, so a replaced photo is announced to search engines too.
  const { media } = getDictionary("en");
  const tube = getTubeProduct();
  const eff = getEffervescentProduct();
  const printing = getPrinting();
  const apps = getApplications();
  const about = getAbout();
  const src = (list: ({ src: string } | undefined | null)[]) => [...new Set(list.filter((x): x is { src: string } => !!x?.src).map((x) => x.src))];
  const pages = [
    { path: "", types: ["page.home", "global."], images: src([media.hero.slides[0]?.product, ...media.products.cards.map((c) => c.image)]) },
    { path: productPaths.tube, types: ["product.tube", "global."], images: src([media.products.cards[0]?.image, media.site.ctaTube, tube.images?.hero ? { src: tube.images.hero.ltr } : null, ...tube.samples.map((x) => ({ src: x.image }))]) },
    { path: applicationsPath, types: ["page.applications", "global."], images: src([...apps.industries.items.map((x) => x.image), ...apps.projects.items.map((p) => p.image)]) },
    { path: printingPath, types: ["page.printing", "global."], images: src([media.printing.tubeGold, media.printing.tubeColour, media.printing.layers, ...printing.tech.items.map((m) => m.macro)]) },
    { path: contactPath, types: ["page.contact", "global."], images: src([media.contact.hero, ...media.contact.places.map((p) => p.image)]) },
    { path: aboutPath, types: ["page.about", "global."], images: src([media.about.poster, ...about.gallery.items.map((g) => g.image), ...about.honours.items.map((h) => h.image)]) },
    { path: productPaths.effervescent, types: ["product.effervescent", "global."], images: src([eff.images.uses, ...eff.caps.variants.flatMap((v) => [v.photo, v.image]), eff.images.usesPhoto]) },
    // Form pages the operators marked as indexable (P11).
    ...pageForms().filter((f) => f.page.indexable).map((f) => ({ path: formPath(f.slug), types: [`form.${f.slug}`], images: [] as string[] })),
  ];
  const site = pages.flatMap((p) =>
    locales.map((l) => ({
      url: pageUrl(l, p.path),
      // Real publish dates from OPEX (a lastmod that is always "now" teaches search engines to ignore
      // it). Unknown (snapshot build): no lastmod. Google ignores changefreq and priority.
      ...(lastPublished(...p.types) ? { lastModified: lastPublished(...p.types) } : {}),
      alternates: { languages: languageAlternates(p.path) },
      images: p.images.map((i) => (i.startsWith("http") ? i : `${siteUrl}${i}`)),
    })),
  );
  return [...site, ...(await blogSitemap())];
}

/** Journal: every live, indexable translation with its own hreflang set; lists only where they have posts. */
async function blogSitemap(): Promise<MetadataRoute.Sitemap> {
  const { posts, categories, authors } = await getBlogIndex();
  const abs = (src: string) => (src.startsWith("http") ? src : `${siteUrl}${src}`);
  const live = posts.filter((p) => !p.noindex);
  const newest = (ls: typeof live) => (ls[0] ? { lastModified: new Date(Math.max(...ls.map((p) => Date.parse(p.modifiedAt)))) } : {});
  const out: MetadataRoute.Sitemap = live.map((p) => ({
    url: pageUrl(p.locale, blogPath(p.slug)),
    lastModified: new Date(p.modifiedAt),
    alternates: { languages: postAlternates(p.alternates) },
    images: p.cover ? [abs(p.cover.src)] : [],
  }));
  for (const l of locales) {
    const mine = live.filter((p) => p.locale === l);
    if (!mine.length) continue;
    const pages = Math.ceil(mine.length / PER_PAGE);
    for (let n = 1; n <= pages; n++) out.push({ url: pageUrl(l, n === 1 ? blogPath() : pagePath(n)), ...newest(mine) });
    for (const c of categories) {
      const inCat = mine.filter((p) => p.category?.id === c.id);
      if (c.slug[l] && inCat.length) out.push({ url: pageUrl(l, categoryPath(c.slug[l]!)), ...newest(inCat) });
    }
    for (const a of authors) {
      const by = mine.filter((p) => p.author?.id === a.id);
      if (by.length) out.push({ url: pageUrl(l, authorPath(a.slug)), ...newest(by) });
    }
  }
  return out;
}
