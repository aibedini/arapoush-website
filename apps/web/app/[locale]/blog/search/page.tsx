import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import styles from "@/components/blog/Blog.module.css";
import { at, Breadcrumbs, PostGrid } from "@/components/blog/parts";
import { SearchForm, searchSummary } from "@/components/blog/community";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale } from "@/lib/i18n";
import { blogPath, blogSettings, getBlogPage, searchPosts, tx } from "@/lib/blog";

type Params = Promise<{ locale: string }>;
type Search = Promise<{ q?: string }>;

/** Journal search: results for any query, so never indexed (the articles themselves are). */
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  const page = getBlogPage();
  return { title: isLocale(locale) ? `${tx(page.labels.search, locale)} | ${tx(page.labels.blog, locale)}` : undefined, robots: { index: false, follow: true } };
}

export default async function BlogSearch({ params, searchParams }: { params: Params; searchParams: Search }) {
  await ensureContent();
  const { locale } = await params;
  const s = blogSettings();
  if (!isLocale(locale) || !s.enabled || !s.sections.search) notFound();
  const q = String((await searchParams).q ?? "").slice(0, 100);
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const L = (k: keyof typeof page.labels) => tx(page.labels[k], locale);
  const items = await searchPosts(locale, q);
  return (
    <>
      <Header t={dict} locale={locale} path={`${blogPath()}/search`} />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <Breadcrumbs label={L("blog")} items={[[L("home"), at(locale, "")], [L("blog"), at(locale, blogPath())], [L("search"), null]]} />
          <header className={styles.head}>
            <h1 className={styles.title}>{L("search")}</h1>
            <SearchForm page={page} locale={locale} q={q} />
            {q.trim().length >= 2 && <p className={styles.lead} role="status">{items.length ? searchSummary(page, locale, items.length, q) : L("searchNone")}</p>}
          </header>
          {items.length > 0 && <PostGrid items={items} page={page} locale={locale} />}
        </div>
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
