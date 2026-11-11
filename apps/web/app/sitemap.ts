import { ensureContent } from "@/lib/content";
import type { MetadataRoute } from "next";
import { getDictionary, locales } from "@/lib/i18n";
import { getPrinting } from "@/lib/printing";
import { getEffervescentProduct, getTubeProduct } from "@/lib/products";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { printingPath, productPaths, siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureContent();
  // Key images per page come from content, so a replaced photo is announced to search engines too.
  const { media } = getDictionary("en");
  const tube = getTubeProduct();
  const eff = getEffervescentProduct();
  const printing = getPrinting();
  const src = (list: ({ src: string } | undefined | null)[]) => [...new Set(list.filter((x): x is { src: string } => !!x?.src).map((x) => x.src))];
  const pages = [
    { path: "", priority: 1, images: src([media.hero.slides[0]?.product, ...media.products.cards.map((c) => c.image)]) },
    { path: productPaths.tube, priority: 0.9, images: src([media.products.cards[0]?.image, media.site.ctaTube, tube.images?.hero ? { src: tube.images.hero.ltr } : null]) },
    { path: printingPath, priority: 0.8, images: src([media.printing.tubeGold, media.printing.tubeColour, media.printing.layers, ...printing.tech.items.map((m) => m.macro)]) },
    { path: productPaths.effervescent, priority: 0.9, images: src([eff.images.uses, ...eff.caps.variants.flatMap((v) => [v.photo, v.image]), eff.images.usesPhoto]) },
  ];
  return pages.flatMap((p) =>
    locales.map((l) => ({
      url: pageUrl(l, p.path),
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: l === "fa" ? p.priority : p.priority - 0.1,
      alternates: { languages: languageAlternates(p.path) },
      images: p.images.map((i) => (i.startsWith("http") ? i : `${siteUrl}${i}`)),
    })),
  );
}
