import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Article from "@/components/blog/Article";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { jsonLdHtml } from "@/lib/seo";
import { blogPath, getBlogPage, getPost } from "@/lib/blog";
import { postJsonLd } from "@/lib/blogSeo";
import { articleMetadata } from "@/lib/blogPages";

type Params = Promise<{ locale: string; slug: string }>;

// Articles are built on their first visit and cached until the next publish (webhook → revalidateTag).
export function generateStaticParams() {
  return [];
}

const load = async (locale: string, slug: string) => (isLocale(locale) ? getPost(locale, decodeURIComponent(slug)) : null);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale, slug } = await params;
  const r = await load(locale, slug);
  if (!r?.post || !isLocale(locale)) return {};
  return articleMetadata(r.post, locale);
}

export default async function BlogArticle({ params }: { params: Params }) {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const r = await load(locale, slug);
  // An old slug answers 301 to the current one; an unknown or unpublished one 404.
  if (r?.redirect) permanentRedirect(`/${locale}${blogPath(r.redirect)}`);
  if (!r?.post) notFound();
  const post = r.post;
  const dict = getDictionary(locale);
  const page = getBlogPage();
  // The language switch opens the translation, or the journal where there is none.
  const paths = Object.fromEntries(locales.map((l) => [l, post.alternates[l] ? blogPath(post.alternates[l]) : blogPath()]));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(postJsonLd(dict, page, post, locale)) }} />
      <Header t={dict} locale={locale} path={blogPath(post.slug)} paths={paths} />
      <main id="main" className={styles.page}>
        <Article post={post} page={page} locale={locale} />
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
