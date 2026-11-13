import type { Metadata } from "next";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";
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
import { languageAlternates, pageUrl, productEffJsonLd, jsonLdHtml, ogBase } from "@/lib/seo";
import { productPaths } from "@/lib/site";
import { getEffervescentProduct } from "@/lib/products";
import { ensureContent, opexEnabled } from "@/lib/content";

const PATH = productPaths.effervescent;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
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
      ...ogBase(locale, getDictionary(locale).common.brand),
      images: [{ url: og.src, width: og.width, height: og.height, alt: m.title }],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [og.src] },
  };
}

export default async function EffervescentTubePage({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
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
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(productEffJsonLd(t, product, locale, PATH)) }}
      />
      <Header t={t} locale={locale} path={PATH} />
      <EditScope on={edit} entry="product.effervescent.page" label="صفحهٔ قرص جوشان">
      <main id="main" className={styles.page}>
          <EffStage t={t.productEff} product={product} size={hero} dir={localeMeta[locale].dir} locale={locale} />
          <SizeLineup t={t.productEff.sizes} product={product} locale={locale} contact={t.site.contact} direct={opexEnabled()} />
          <CapCompare t={t.productEff.caps} caps={product.caps} locale={locale} />
          <Uses t={t.productEff.uses} photo={product.images.usesPhoto} bg={product.images.usesBg} locale={locale} />
          <Making t={t.productEff.make} product={product} locale={locale} seals={t.media.certifications.seals} />
        </main>
      </EditScope>
      <ContactCTA t={t} locale={locale} blend="navy" />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
