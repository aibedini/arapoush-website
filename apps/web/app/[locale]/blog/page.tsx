import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import ListView from "@/components/blog/ListView";
import EditScope from "@/components/opex/EditScope";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { editMode } from "@/lib/content/edit";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { jsonLdHtml } from "@/lib/seo";
import { blogPath, getBlogPage, listPosts, tx } from "@/lib/blog";
import { listJsonLd } from "@/lib/blogSeo";
import { categoriesFor, listMetadata } from "@/lib/blogPages";

type Params = Promise<{ locale: string }>;
const PATH = blogPath();

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = getBlogPage();
  const list = await listPosts(locale);
  return listMetadata({ locale, path: PATH, title: tx(page.meta.title, locale), description: tx(page.meta.description, locale), empty: list.total === 0, image: list.items[0]?.cover?.src });
}

/** The journal: newest first, the latest featured, category chips, pages of 12. */
export default async function BlogIndex({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const [list, cats] = await Promise.all([listPosts(locale), categoriesFor(locale)]);
  const title = tx(page.hero.title, locale);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(listJsonLd(dict, page, { locale, path: PATH, name: tx(page.meta.title, locale), description: tx(page.meta.description, locale), items: list.items })) }} />
      <Header t={dict} locale={locale} path={PATH} />
      <EditScope on={edit} entry="page.blog" label="صفحهٔ مجله">
        <main id="main" className={styles.page}>
          <ListView page={page} locale={locale} list={list} cats={cats} eyebrow={tx(page.hero.eyebrow, locale)} title={title} lead={tx(page.hero.lead, locale)} />
        </main>
      </EditScope>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
