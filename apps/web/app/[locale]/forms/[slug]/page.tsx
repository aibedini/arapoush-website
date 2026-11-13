import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pickL } from "@arapoush/schema";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import OpexForm from "@/components/forms/OpexForm";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { ensureContent } from "@/lib/content";
import { getForm, pageForms } from "@/lib/content/forms";
import { formPath } from "@/lib/forms";
import { languageAlternates, pageUrl, ogBase } from "@/lib/seo";
import styles from "./FormPage.module.css";

type Params = Promise<{ locale: string; slug: string }>;

// Forms published later get their page on first request (then cached until the next publish).
export const dynamicParams = true;

export async function generateStaticParams() {
  await ensureContent();
  return pageForms().flatMap((f) => locales.map((locale) => ({ locale, slug: f.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale, slug } = await params;
  const form = getForm(slug);
  // A missing form must not inherit the home page's canonical (SEO audit).
  if (!isLocale(locale) || !form?.page?.enabled) return { robots: { index: false, follow: true } };
  const t = getDictionary(locale);
  const path = formPath(slug);
  const title = pickL(form.page.title, locale) || pickL(form.title, locale);
  const description = pickL(form.page.description, locale) || pickL(form.intro, locale) || t.meta.description;
  const url = pageUrl(locale, path);
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: { type: "website", url, title, description, ...ogBase(locale, t.common.brand), images: [{ url: t.media.site.og.src, width: t.media.site.og.width, height: t.media.site.og.height }] },
    twitter: { card: "summary_large_image", title, description, images: [t.media.site.og.src] },
    // Operators choose per form whether its page is indexed.
    ...(form.page.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

/** A form built in OPEX on its own page; each submission becomes a ticket in the OPEX helpdesk. */
export default async function FormPage({ params }: { params: Params }) {
  await ensureContent();
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const form = getForm(slug);
  if (!form?.page?.enabled) notFound();
  const t = getDictionary(locale);
  const path = formPath(slug);
  const intro = pickL(form.intro, locale);

  return (
    <>
      <Header t={t} locale={locale} path={path} />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <header className={styles.head} data-reveal>
            <h1 className={styles.h1}>{pickL(form.page.title, locale) || pickL(form.title, locale)}</h1>
            {intro && <p className={styles.lead}>{intro}</p>}
          </header>
          <div className={styles.card}>
            <OpexForm form={form} t={t.forms} locale={locale} page={`/${locale}${path}`} />
          </div>
        </div>
      </main>
      <ContactCTA t={t} locale={locale} footerOnly />
      <Reveals />
      <TouchFeedback />
    </>
  );
}
