import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import EffStage from "@/components/effervescent/EffStage";
import SizeLineup from "@/components/effervescent/SizeLineup";
import CapCompare from "@/components/effervescent/CapCompare";
import { Making, Uses } from "@/components/effervescent/EffSections";
import styles from "@/components/effervescent/Effervescent.module.css";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl, productEffJsonLd } from "@/lib/seo";
import { productPaths } from "@/lib/site";
import { getEffervescentProduct } from "@/lib/products";

const PATH = productPaths.effervescent;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDictionary(locale).productEff.meta;
  const og = getEffervescentProduct().images.uses;
  const url = pageUrl(locale, PATH);
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: url, languages: languageAlternates(PATH) },
    openGraph: {
      type: "website",
      url,
      title: m.title,
      description: m.description,
      locale: localeMeta[locale].og,
      images: [{ url: og.src, width: og.width, height: og.height, alt: m.title }],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [og.src] },
  };
}

export default async function EffervescentTubePage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const product = getEffervescentProduct();
  const hero = product.sizes.find((s) => s.id === product.defaultSize) ?? product.sizes[0]!;

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productEffJsonLd(t, product, locale, PATH)).replace(/</g, "\\u003c") }}
      />
      <Header t={t} locale={locale} path={PATH} />
      <main id="main" className={styles.page}>
        <EffStage t={t.productEff} product={product} size={hero} dir={localeMeta[locale].dir} locale={locale} />
        <SizeLineup t={t.productEff.sizes} product={product} locale={locale} />
        <CapCompare t={t.productEff.caps} caps={product.caps} locale={locale} />
        <Uses t={t.productEff.uses} image={product.images.uses} />
        <Making t={t.productEff.make} product={product} locale={locale} />
      </main>
      <ContactCTA t={t} locale={locale} />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
