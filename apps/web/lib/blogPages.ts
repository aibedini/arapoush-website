import type { Metadata } from "next";
import { getDictionary, localeMeta, locales, type Locale } from "@/lib/i18n";
import { ogBase, pageUrl } from "@/lib/seo";
import { authorPath, blogPath, getBlogIndex, tx, type BlogPage, type BlogPost } from "@/lib/blog";
import { abs, postAlternates } from "@/lib/blogSeo";

/** hreflang for blog pages that exist in every language (index, pages); x-default Persian. */
export const listAlternates = (path: string, only?: Locale[]) => {
  const ls = only ?? [...locales];
  return { ...Object.fromEntries(ls.map((l) => [l, pageUrl(l, path)])), ...(ls.includes("fa") ? { "x-default": pageUrl("fa", path) } : ls[0] ? { "x-default": pageUrl(ls[0], path) } : {}) };
};

/** Metadata for list-like blog pages. An empty list is noindex (a page with nothing on it is thin content). */
export function listMetadata(o: { locale: Locale; path: string; title: string; description: string; empty: boolean; languages?: Record<string, string>; image?: string }): Metadata {
  const url = pageUrl(o.locale, o.path);
  const brand = getDictionary(o.locale).common.brand;
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: url, languages: o.languages ?? listAlternates(o.path), types: { "application/rss+xml": pageUrl(o.locale, "/blog/feed.xml") } },
    openGraph: { type: "website", url, title: o.title, description: o.description, ...ogBase(o.locale, brand), ...(o.image ? { images: [{ url: o.image }] } : {}) },
    twitter: { card: "summary_large_image", title: o.title, description: o.description },
    ...(o.empty ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Categories that have a slug in this language (chips and category pages). */
export async function categoriesFor(locale: Locale) {
  const idx = await getBlogIndex();
  return idx.categories.filter((c) => c.slug[locale]).map((c) => ({ id: c.id, name: c.name[locale] ?? c.name.en ?? c.name.fa ?? "", slug: c.slug[locale]!, description: c.description[locale] ?? "" }));
}

export const pageTitle = (page: BlogPage, locale: Locale) => tx(page.meta.title, locale);

/** Title, description, canonical, hreflang to real translations, Open Graph article, robots. */
export function articleMetadata(post: BlogPost, locale: Locale, opts: { noindex?: boolean } = {}): Metadata {
  const url = pageUrl(locale, blogPath(post.slug));
  const title = post.seo.title || post.title;
  const description = post.seo.description || post.excerpt;
  const img = post.seo.ogImage ?? post.cover;
  const images = img ? [{ url: abs(img.src), ...(img.width ? { width: img.width, height: img.height } : {}), alt: img.alt || post.title }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: post.seo.canonical || url, languages: postAlternates(post.alternates), types: { "application/rss+xml": pageUrl(locale, "/blog/feed.xml") } },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      ...ogBase(locale, getDictionary(locale).common.brand),
      alternateLocale: locales.filter((l) => l !== locale && post.alternates[l]).map((l) => localeMeta[l].og),
      publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt,
      ...(post.category ? { section: post.category.name } : {}),
      ...(post.tags.length ? { tags: post.tags.map((t) => t.name) } : {}),
      ...(post.author ? { authors: [pageUrl(locale, authorPath(post.author.slug))] } : {}),
      ...(images ? { images } : {}),
    },
    twitter: { card: "summary_large_image", title, description, ...(images ? { images: [images[0]!.url] } : {}) },
    ...(post.seo.noindex || opts.noindex ? { robots: { index: false, follow: true } } : {}),
    other: { "article:published_time": post.publishedAt, "article:modified_time": post.modifiedAt },
  };
}
