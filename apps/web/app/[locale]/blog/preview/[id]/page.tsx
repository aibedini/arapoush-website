import type { Metadata } from "next";
import { cookies, draftMode } from "next/headers";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import Article from "@/components/blog/Article";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale } from "@/lib/i18n";
import { blogPath, getBlogPage, getPreview, tx } from "@/lib/blog";

type Params = Promise<{ locale: string; id: string }>;

/** Never indexed, never cached: a draft seen through a preview link from the OPEX console. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BlogPreview({ params }: { params: Params }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^pst_[0-9A-Z]{26}$/.test(id)) notFound();
  // The link (/api/opex/preview) turned on draft mode and stored the token; OPEX checks it again here.
  if (!(await draftMode()).isEnabled) notFound();
  const token = (await cookies()).get("opex_preview")?.value;
  if (!token) notFound();
  await ensureContent();
  const post = await getPreview(id, locale, token);
  if (!post) notFound();
  const dict = getDictionary(locale);
  const page = getBlogPage();
  return (
    <>
      <div className={styles.previewBar} role="status">
        {tx(page.labels.preview, locale)}
      </div>
      <Header t={dict} locale={locale} path={blogPath()} />
      <main id="main" className={styles.page}>
        <Article post={post} page={page} locale={locale} />
      </main>
    </>
  );
}
