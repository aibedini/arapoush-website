import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import Configurator from "@/components/configurator/Configurator";
import { LayerStructure, ProductHero } from "@/components/product/ProductSections";
import styles from "@/components/product/Product.module.css";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl, productTubeJsonLd } from "@/lib/seo";
import { productPaths } from "@/lib/site";

const PATH = productPaths.tube;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDictionary(locale).productTube.meta;
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
      images: [{ url: "/images/product-tube.webp", width: 1095, height: 1436, alt: m.title }],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: ["/images/product-tube.webp"] },
  };
}

export default async function MultiLayerTubePage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productTubeJsonLd(t, locale, PATH)).replace(/</g, "\\u003c") }}
      />
      <Header t={t} locale={locale} path={PATH} />
      <main id="main" className={styles.page}>
        <div className={styles.wrap}>
          <ProductHero t={t.productTube} video={null} />
          <Configurator t={t.productTube} />
          <div className={styles.lower}>
            <LayerStructure t={t.productTube} />
          </div>
        </div>
      </main>
      {/* Same closing CTA and footer as every page. */}
      <ContactCTA t={t} locale={locale} />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
