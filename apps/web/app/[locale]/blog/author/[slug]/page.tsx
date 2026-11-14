import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import { at, Breadcrumbs, PostGrid } from "@/components/blog/parts";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { jsonLdHtml } from "@/lib/seo";
import { authorPath, blogPath, fill, getBlogIndex, getBlogPage, listPosts, tx, type BlogAuthor, blogSettings } from "@/lib/blog";
import { authorJsonLd } from "@/lib/blogSeo";
import { listMetadata } from "@/lib/blogPages";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return [];
}

async function findAuthor(locale: Locale, raw: string): Promise<BlogAuthor | null> {
  const slug = decodeURIComponent(raw);
  const a = (await getBlogIndex()).authors.find((x) => x.slug === slug);
  if (!a) return null;
  const pick = (v: Partial<Record<Locale, string>>) => v[locale] ?? v.en ?? v.fa ?? "";
  return { id: a.id, slug: a.slug, name: pick(a.name), role: pick(a.role), bio: pick(a.bio), expertise: a.expertise, photo: a.photo, sameAs: a.sameAs };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const a = await findAuthor(locale, slug);
  if (!a) return {};
  const page = getBlogPage();
  const list = await listPosts(locale, { author: a.slug, per: 48 });
  const title = fill(tx(page.labels.authorPosts, locale), { name: a.name });
  return listMetadata({ locale, path: authorPath(a.slug), title: `${a.name}${a.role ? ` – ${a.role}` : ""} | ${tx(page.labels.blog, locale)}`, description: a.bio || title, empty: list.total === 0, image: a.photo?.src });
}

/** Author profile (E-E-A-T): who writes, their expertise and profiles, and their articles. */
export default async function BlogAuthorPage({ params }: { params: Params }) {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale) || !blogSettings().enabled) notFound();
  const a = await findAuthor(locale, slug);
  if (!a) notFound();
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const list = await listPosts(locale, { author: a.slug, per: 48 });
  const L = (k: keyof typeof page.labels) => tx(page.labels[k], locale);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(authorJsonLd(dict, page, a, list.items, locale)) }} />
      <Header t={dict} locale={locale} path={authorPath(a.slug)} />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <Breadcrumbs label={L("blog")} items={[[L("home"), at(locale, "")], [L("blog"), at(locale, blogPath())], [a.name, null]]} />
          <header className={styles.authorBox} style={{ marginBlockEnd: 40 }}>
            {a.photo ? <Image src={a.photo.src} alt="" width={72} height={72} priority /> : <span />}
            <div>
              <h1 className={styles.title} style={{ fontSize: "clamp(26px, 3vw, 40px)" }}>
                {a.name}
              </h1>
              {a.role && <div className={styles.role}>{a.role}</div>}
              {a.bio && <p>{a.bio}</p>}
              {a.expertise.length > 0 && (
                <p>
                  <strong>{L("expertise")}:</strong> {a.expertise.join("، ")}
                </p>
              )}
              {a.sameAs.length > 0 && (
                <ul className={styles.tags} style={{ marginBlockStart: 10 }}>
                  {a.sameAs.map((u) => (
                    <li key={u}>
                      <a href={u} rel="me noopener" target="_blank" className={styles.chip}>
                        {new URL(u).hostname.replace(/^www\./, "")}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </header>
          <h2 className={styles.title} style={{ fontSize: "clamp(20px, 2vw, 28px)", marginBlockEnd: 20 }}>
            {fill(L("authorPosts"), { name: a.name })}
          </h2>
          <PostGrid items={list.items} page={page} locale={locale} />
        </div>
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
    </>
  );
}
