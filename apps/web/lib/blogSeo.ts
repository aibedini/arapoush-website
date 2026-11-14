import { headings, stripInline } from "@arapoush/schema";
import { defaultLocale, localeMeta, locales, type Dictionary, type Locale } from "@/lib/i18n";
import { pageUrl, orgBase } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { authorPath, blogPath, categoryPath, tx, type BlogAuthor, type BlogCard, type BlogPage, type BlogPost } from "@/lib/blog";

export const abs = (src: string) => (src.startsWith("http") ? src : `${siteUrl}${src}`);

/** hreflang only to translations that exist; x-default is the Persian one, else the first. */
export function postAlternates(alternates: Partial<Record<Locale, string>>) {
  const langs = locales.filter((l) => alternates[l]);
  const map: Record<string, string> = Object.fromEntries(langs.map((l) => [l, pageUrl(l, blogPath(alternates[l]))]));
  const def = alternates[defaultLocale] ? defaultLocale : langs[0];
  if (def) map["x-default"] = pageUrl(def, blogPath(alternates[def]));
  return map;
}

const person = (a: BlogAuthor, locale: Locale) => ({
  "@type": "Person",
  "@id": `${siteUrl}/#author-${a.slug}`,
  name: a.name,
  url: pageUrl(locale, authorPath(a.slug)),
  ...(a.role ? { jobTitle: a.role } : {}),
  ...(a.bio ? { description: a.bio } : {}),
  ...(a.photo ? { image: abs(a.photo.src) } : {}),
  ...(a.expertise.length ? { knowsAbout: a.expertise } : {}),
  ...(a.sameAs.length ? { sameAs: a.sameAs } : {}),
  worksFor: { "@id": `${siteUrl}/#organization` },
});

const crumbs = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

/** BlogPosting + breadcrumbs + FAQ: what search and AI engines read about one article. */
export function postJsonLd(t: Dictionary, page: BlogPage, post: BlogPost, locale: Locale) {
  const url = pageUrl(locale, blogPath(post.slug));
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  const images = [post.cover, post.seo.ogImage].filter((x): x is NonNullable<typeof x> => !!x?.src).map((i) => abs(i.src));
  const h = headings(post.body);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        mainEntityOfPage: { "@type": "WebPage", "@id": url, url },
        headline: post.title.slice(0, 110),
        description: post.seo.description || post.excerpt,
        inLanguage: localeMeta[locale].intl,
        url,
        ...(images.length ? { image: [...new Set(images)] } : {}),
        datePublished: post.publishedAt,
        dateModified: post.modifiedAt,
        wordCount: post.wordCount,
        timeRequired: `PT${post.readingMinutes}M`,
        ...(post.category ? { articleSection: post.category.name } : {}),
        ...(post.tags.length || post.seo.keyphrase || post.keywords.length ? { keywords: [...new Set([post.seo.keyphrase, ...post.keywords, ...post.tags.map((x) => x.name)].filter(Boolean))].join(", ") } : {}),
        // Approved comments (people discussing the article: a signal of real engagement).
        ...(post.comments.length
          ? {
              commentCount: post.comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0),
              comment: post.comments.slice(0, 20).map((c) => ({ "@type": "Comment", text: c.body, dateCreated: c.createdAt, author: c.team ? { "@id": `${siteUrl}/#organization` } : { "@type": "Person", name: c.name } })),
            }
          : {}),
        ...(post.author ? { author: person(post.author, locale) } : { author: { "@id": `${siteUrl}/#organization` } }),
        ...(post.reviewer ? { reviewedBy: person(post.reviewer, locale) } : {}),
        publisher: { "@id": `${siteUrl}/#organization` },
        isPartOf: { "@type": "Blog", "@id": `${pageUrl(locale, blogPath())}#blog` },
        ...(post.sources.length ? { citation: post.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })) } : {}),
        ...(post.keyTakeaways.length ? { abstract: post.keyTakeaways.join(" ") } : {}),
        // Section anchors let AI answers cite one passage.
        ...(h.length ? { hasPart: h.filter((x) => x.level === 2).map((x) => ({ "@type": "WebPageElement", name: x.text, url: `${url}#${x.anchor}` })) } : {}),
      },
      orgBase(t),
      crumbs([
        [L("home"), pageUrl(locale)],
        [L("blog"), pageUrl(locale, blogPath())],
        ...(post.category?.slug ? ([[post.category.name, pageUrl(locale, categoryPath(post.category.slug))]] as [string, string][]) : []),
        [post.title, url],
      ]),
      ...(post.faq.length
        ? [{ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: post.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripInline(f.a) } })) }]
        : []),
    ],
  };
}

/** Blog index, a page of it, or a category: a collection with its items. */
export function listJsonLd(t: Dictionary, page: BlogPage, o: { locale: Locale; path: string; name: string; description: string; items: BlogCard[]; trail?: [string, string][] }) {
  const url = pageUrl(o.locale, o.path);
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], o.locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": o.path === blogPath() ? "Blog" : "CollectionPage",
        "@id": o.path === blogPath() ? `${url}#blog` : `${url}#page`,
        url,
        name: o.name,
        description: o.description,
        inLanguage: localeMeta[o.locale].intl,
        publisher: { "@id": `${siteUrl}/#organization` },
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: o.items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: pageUrl(o.locale, blogPath(p.slug)), name: p.title })),
        },
      },
      orgBase(t),
      crumbs([[L("home"), pageUrl(o.locale)], [L("blog"), pageUrl(o.locale, blogPath())], ...(o.trail ?? [])]),
    ],
  };
}

/** Author page: a ProfilePage about the Person, with their articles. */
export function authorJsonLd(t: Dictionary, page: BlogPage, a: BlogAuthor, items: BlogCard[], locale: Locale) {
  const url = pageUrl(locale, authorPath(a.slug));
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ProfilePage", "@id": `${url}#page`, url, name: a.name, inLanguage: localeMeta[locale].intl, mainEntity: person(a, locale), hasPart: items.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: pageUrl(locale, blogPath(p.slug)) })) },
      orgBase(t),
      crumbs([[L("home"), pageUrl(locale)], [L("blog"), pageUrl(locale, blogPath())], [a.name, url]]),
    ],
  };
}
