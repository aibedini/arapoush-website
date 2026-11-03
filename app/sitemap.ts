import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { printingPath, productPaths, siteUrl } from "@/lib/site";

// Every public page, once per locale, with its hreflang alternates and key images.
const pages = [
  { path: "", priority: 1, images: ["/images/hero-products.webp", "/images/product-tube.webp", "/images/product-effervescent.webp"] },
  { path: productPaths.tube, priority: 0.9, images: ["/images/product-tube.webp", "/images/cta-tube.webp"] },
  { path: printingPath, priority: 0.8, images: ["/images/printing/tube-gold.webp", "/images/printing/tube-colour.webp", "/images/printing/layers.webp", "/images/printing/macro-flexo.webp", "/images/printing/macro-offset.webp", "/images/printing/macro-silk.webp", "/images/printing/macro-hotstamp.webp", "/images/printing/macro-combination.webp"] },
  { path: productPaths.effervescent, priority: 0.9, images: ["/images/eff/uses-products.webp", "/images/eff/cap-plain-photo.webp", "/images/eff/uses-tablets.webp", "/images/eff/cap-spiral.webp", "/images/eff/cap-plain.webp"] },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap((p) =>
    locales.map((l) => ({
      url: pageUrl(l, p.path),
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: l === "fa" ? p.priority : p.priority - 0.1,
      alternates: { languages: languageAlternates(p.path) },
      images: p.images.map((i) => `${siteUrl}${i}`),
    })),
  );
}
