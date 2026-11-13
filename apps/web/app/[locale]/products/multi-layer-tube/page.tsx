import type { Metadata } from "next";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import Configurator, { type ConfiguratorStyle } from "@/components/configurator/Configurator";
import TubeState from "@/components/configurator/TubeState";
import { QuoteSection, SamplesSection } from "@/components/configurator/TubeSections";
import Block from "@/components/sections/blocks/Block";
import { isBlockKind, TUBE_SECTIONS, type BlockKind } from "@arapoush/schema";
import { getTubeLayout, getTubeQuote } from "@/lib/tubeLayout";
import { getContactPage, pageForm } from "@/lib/contact";
import { LayerStructure, ProductHero } from "@/components/product/ProductSections";
import styles from "@/components/product/Product.module.css";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl, productTubeJsonLd, jsonLdHtml, ogBase } from "@/lib/seo";
import { productPaths } from "@/lib/site";
import { getTubeProduct } from "@/lib/products";
import { ensureContent } from "@/lib/content";

const PATH = productPaths.tube;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDictionary(locale).productTube.meta;
  const hero = getTubeProduct().images.hero;
  const og = hero[localeMeta[locale].dir];
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
      images: [{ url: og, width: hero.width, height: hero.height, alt: m.title }],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [og] },
  };
}

export default async function MultiLayerTubePage({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const product = getTubeProduct();
  const dir = localeMeta[locale].dir;

  const layout = getTubeLayout();
  const closing = layout.find((x) => x.type === "closing");
  const quote = getTubeQuote();
  const quoteForm = pageForm(quote.form);
  const department = getContactPage().directory.departments.find((d) => d.id === quote.department);

  // Each section in the operator's order; blocks carry their own props (visual editor base path).
  const render = (sec: (typeof layout)[number]) => {
    switch (sec.type) {
      case "hero":
        return <ProductHero t={t.productTube} video={null} image={product.images.hero} locale={locale} dir={dir} style={sec.style} />;
      case "configurator":
        return <Configurator style={sec.style as ConfiguratorStyle} />;
      case "samples":
        return <SamplesSection style={sec.style as "grid" | "rail"} />;
      case "quote":
        return quoteForm ? <QuoteSection email={t.site.contact.email} form={quoteForm} forms={t.forms} department={department} /> : null;
      case "structure":
        return (
          <div className={styles.lower}>
            <LayerStructure t={t.productTube} structure={product.structures[0]} image={product.images.layers} locale={locale} dir={dir} style={sec.style} />
          </div>
        );
      default:
        return isBlockKind(sec.type) ? <Block kind={sec.type as BlockKind} id={sec.id} props={sec.props ?? {}} t={t} locale={locale} /> : null;
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(productTubeJsonLd(t, product, locale, PATH)) }}
      />
      <Header t={t} locale={locale} path={PATH} />
      <EditScope on={edit} entry="product.tube.page" label="صفحهٔ تیوب">
        <main id="main" className={styles.page}>
          <div className={styles.wrap}>
            <TubeState product={product} c={t.productTube.configurator} locale={locale}>
              {layout.map((sec, i) => {
                if (!sec.enabled || sec.type === "closing") return null;
                const block = isBlockKind(sec.type);
                const def = block ? null : TUBE_SECTIONS[sec.type as keyof typeof TUBE_SECTIONS];
                return (
                  <EditScope key={sec.id} on={edit} section={sec.id} label={def?.label ?? sec.type} entry={block ? "product.tube.page" : def!.entry} base={block ? `/layout/sections[${i}]/props` : undefined}>
                    {render(sec)}
                  </EditScope>
                );
              })}
            </TubeState>
          </div>
        </main>
      </EditScope>
      {/* Same closing call to action and footer as every page; hidden in the layout, only the footer stays. */}
      <ContactCTA t={t} locale={locale} footerOnly={!closing?.enabled} />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
