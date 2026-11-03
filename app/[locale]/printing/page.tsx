import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import PrintHero from "@/components/printing/PrintHero";
import TechExplorer from "@/components/printing/TechExplorer";
import SelectionGuide from "@/components/printing/SelectionGuide";
import SampleCarousel from "@/components/printing/SampleCarousel";
import { Comparison, Downloads, PrintCta } from "@/components/printing/PrintSections";
import styles from "@/components/printing/Printing.module.css";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl, printingJsonLd } from "@/lib/seo";
import { printingPath } from "@/lib/site";
import { getPrinting, t } from "@/lib/printing";

const PATH = printingPath;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const p = getPrinting();
  const title = t(p.meta.title, locale);
  const description = t(p.meta.description, locale);
  const url = pageUrl(locale, PATH);
  const og = { url: "/images/printing/tube-gold.webp", width: 1086, height: 1448, alt: t(p.hero.tubesAlt, locale) };
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(PATH) },
    openGraph: { type: "website", url, title, description, locale: localeMeta[locale].og, images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og.url] },
  };
}

/** Printing technologies: the five methods, a selection guide, samples, resources and a comparison. */
export default async function PrintingPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const p = getPrinting();

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so content text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(printingJsonLd(dict, p, locale, PATH)).replace(/</g, "\\u003c") }}
      />
      <Header t={dict} locale={locale} path={PATH} />
      <main id="main" className={styles.page}>
        <PrintHero c={p.hero} locale={locale} />
        <TechExplorer c={p.tech} locale={locale} />
        <SelectionGuide c={p.guide} techs={p.tech.items} locale={locale} />
        <SampleCarousel c={p.samples} techs={p.tech.items} locale={locale} />
        <Downloads c={p.downloads} locale={locale} />
        <Comparison c={p.compare} techs={p.tech.items} locale={locale} />
        <PrintCta c={p.cta} locale={locale} />
      </main>
      <ContactCTA t={dict} locale={locale} footerOnly />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
