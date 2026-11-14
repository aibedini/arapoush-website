import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import ListView from "@/components/blog/ListView";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";
import { jsonLdHtml, pageUrl } from "@/lib/seo";
import { categoryPath, fill, getBlogIndex, getBlogPage, listPosts, tx } from "@/lib/blog";
import { listJsonLd } from "@/lib/blogSeo";
import { categoriesFor, listMetadata } from "@/lib/blogPages";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return [];
}

async function find(locale: Locale, raw: string) {
  const slug = decodeURIComponent(raw);
  const cats = await categoriesFor(locale);
  return { cat: cats.find((c) => c.slug === slug), cats };
}

/** The same category in the other languages (hreflang only where it has a slug). */
async function categoryAlternates(id: string) {
  const c = (await getBlogIndex()).categories.find((x) => x.id === id);
  const langs = locales.filter((l) => c?.slug[l]);
  return Object.fromEntries([...langs.map((l) => [l, pageUrl(l, categoryPath(c!.slug[l]!))]), ...(langs[0] ? [["x-default", pageUrl(langs.includes("fa") ? "fa" : langs[0], categoryPath(c!.slug[langs.includes("fa") ? "fa" : langs[0]]!))]] : [])]);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const { cat } = await find(locale, slug);
  if (!cat) return {};
  const page = getBlogPage();
  const list = await listPosts(locale, { category: cat.slug, per: 48 });
  const title = fill(tx(page.labels.categoryPosts, locale), { name: cat.name });
  return listMetadata({ locale, path: categoryPath(cat.slug), title: `${title} | ${tx(page.labels.blog, locale)}`, description: cat.description || `${title}. ${tx(page.meta.description, locale)}`, empty: list.total === 0, languages: await categoryAlternates(cat.id), image: list.items[0]?.cover?.src });
}

/** One category: its description and up to 48 articles (more pages when it grows). */
export default async function BlogCategory({ params }: { params: Params }) {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const { cat, cats } = await find(locale, slug);
  if (!cat) notFound();
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const list = await listPosts(locale, { category: cat.slug, per: 48 });
  const title = fill(tx(page.labels.categoryPosts, locale), { name: cat.name });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(listJsonLd(dict, page, { locale, path: categoryPath(cat.slug), name: title, description: cat.description, items: list.items, trail: [[cat.name, pageUrl(locale, categoryPath(cat.slug))]] })) }} />
      <Header t={dict} locale={locale} path={categoryPath(cat.slug)} />
      <main id="main" className={styles.page}>
        <ListView page={page} locale={locale} list={{ ...list, pages: 1 }} cats={cats} current={cat.slug} eyebrow={tx(page.labels.categories, locale)} title={title} lead={cat.description} trail={[[cat.name, null]]} />
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
