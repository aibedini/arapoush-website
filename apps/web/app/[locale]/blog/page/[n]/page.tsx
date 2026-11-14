import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import ListView from "@/components/blog/ListView";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale } from "@/lib/i18n";
import { jsonLdHtml, pageUrl } from "@/lib/seo";
import { blogPath, fill, getBlogPage, listPosts, pagePath, tx } from "@/lib/blog";
import { listJsonLd } from "@/lib/blogSeo";
import { categoriesFor, listMetadata } from "@/lib/blogPages";

type Params = Promise<{ locale: string; n: string }>;

// Built on first visit, then cached until the next publish.
export function generateStaticParams() {
  return [];
}

const num = (n: string) => (/^[1-9]\d{0,3}$/.test(n) ? Number(n) : 0);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale, n } = await params;
  if (!isLocale(locale) || num(n) < 2) return {};
  const page = getBlogPage();
  const list = await listPosts(locale, { page: num(n) });
  const label = fill(tx(page.labels.page, locale), { n: num(n) });
  return listMetadata({ locale, path: pagePath(num(n)), title: `${tx(page.meta.title, locale)} – ${label}`, description: `${tx(page.meta.description, locale)} ${label}`, empty: !list.items.length });
}

/** Page 2+ of the journal: real, crawlable URLs with self canonicals. */
export default async function BlogPageN({ params }: { params: Params }) {
  await ensureContent();
  const { locale, n } = await params;
  if (!isLocale(locale)) notFound();
  const p = num(n);
  if (p === 1) permanentRedirect(`/${locale}${blogPath()}`);
  if (p < 2) notFound();
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const [list, cats] = await Promise.all([listPosts(locale, { page: p }), categoriesFor(locale)]);
  if (p > list.pages) notFound();
  const label = fill(tx(page.labels.page, locale), { n: p.toLocaleString() });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(listJsonLd(dict, page, { locale, path: pagePath(p), name: `${tx(page.meta.title, locale)} – ${label}`, description: tx(page.meta.description, locale), items: list.items, trail: [[label, pageUrl(locale, pagePath(p))]] })) }} />
      <Header t={dict} locale={locale} path={pagePath(p)} />
      <main id="main" className={styles.page}>
        <ListView page={page} locale={locale} list={list} cats={cats} eyebrow={tx(page.hero.eyebrow, locale)} title={`${tx(page.hero.title, locale)} – ${label}`} trail={[[label, null]]} />
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
