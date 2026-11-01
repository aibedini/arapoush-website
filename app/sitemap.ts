import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.map((l) => ({
    url: pageUrl(l),
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: l === "fa" ? 1 : 0.9,
    alternates: { languages: languageAlternates() },
    images: ["/images/hero-products.webp", "/images/product-tube.webp", "/images/product-effervescent.webp"].map((p) => `${siteUrl}${p}`),
  }));
}
