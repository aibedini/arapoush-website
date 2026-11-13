import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import AboutHero from "@/components/about/AboutHero";
import AboutStory from "@/components/about/AboutStory";
import FactoryGallery from "@/components/about/FactoryGallery";
import Honours from "@/components/about/Honours";
import styles from "@/components/printing/Printing.module.css";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { aboutJsonLd, languageAlternates, pageUrl, jsonLdHtml, ogBase } from "@/lib/seo";
import { aboutPath } from "@/lib/site";
import { getAbout, t } from "@/lib/about";
import { ensureContent } from "@/lib/content";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";

const PATH = aboutPath;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const a = getAbout();
  const title = t(a.meta.title, locale);
  const description = t(a.meta.description, locale);
  const url = pageUrl(locale, PATH);
  const photo = a.gallery.items[0]?.image ?? getDictionary(locale).media.about.poster;
  const og = { url: photo.src, width: photo.width, height: photo.height, alt: t(a.gallery.items[0]?.caption ?? a.hero.videoAlt, locale) };
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(PATH) },
    openGraph: { type: "website", url, title, description, ...ogBase(locale, getDictionary(locale).common.brand), images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og.url] },
  };
}

/** About Arapoush: the factory film, the story from 2004 to today, the factory, honours and certificates. */
export default async function AboutPage({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const a = getAbout();

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so content text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(aboutJsonLd(dict, a, locale, PATH)) }}
      />
      <Header t={dict} locale={locale} path={PATH} />
      <EditScope on={edit} entry="page.about" label="صفحهٔ درباره آراپوش">
        <main id="main" className={styles.page}>
          <AboutHero c={a.hero} locale={locale} poster={dict.media.about.poster} />
          <AboutStory c={a.story} locale={locale} />
          <FactoryGallery c={a.gallery} locale={locale} />
          <Honours c={a.honours} locale={locale} />
        </main>
      </EditScope>
      <ContactCTA t={dict} locale={locale} footerOnly />
      <Reveals />
      <TouchFeedback />
    </>
  );
}
