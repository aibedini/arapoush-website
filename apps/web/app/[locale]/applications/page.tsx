import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import AppHero from "@/components/applications/AppHero";
import IndustryShowcase from "@/components/applications/IndustryShowcase";
import FinderSection from "@/components/applications/FinderSection";
import Engineering from "@/components/applications/Engineering";
import type { FinderRefs } from "@/components/applications/SolutionFinder";
import { getTubeProduct } from "@/lib/products";
import { getPrinting } from "@/lib/printing";
import styles from "@/components/applications/Applications.module.css";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { applicationsJsonLd, languageAlternates, pageUrl } from "@/lib/seo";
import { applicationsPath } from "@/lib/site";
import { getApplications, t } from "@/lib/applications";
import { ensureContent } from "@/lib/content";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";

const PATH = applicationsPath;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const a = getApplications();
  const title = t(a.meta.title, locale);
  const description = t(a.meta.description, locale);
  const url = pageUrl(locale, PATH);
  const photo = a.industries.items[0]!.image;
  const og = { url: photo.src, width: photo.width, height: photo.height, alt: t(a.industries.items[0]!.title, locale) };
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(PATH) },
    openGraph: { type: "website", url, title, description, locale: localeMeta[locale].og, images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og.url] },
  };
}

/**
 * Applications by industry (replaces the five old industry pages): hero, the industry showcase, the
 * solution finder, tube engineering, sample projects, quality, an industry-aware quote and the FAQ.
 */
export default async function ApplicationsPage({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const a = getApplications();
  // The finder suggests real closures (catalogue names and photos) and print methods (printing page).
  const wanted = new Set(a.finder.contents.flatMap((x) => x.closures));
  const refs: FinderRefs = {
    closures: Object.fromEntries(getTubeProduct().closures.filter((x) => wanted.has(x.id) && x.image).map((x) => [x.id, { name: x.name, image: x.image }])),
    techs: Object.fromEntries(getPrinting().tech.items.map((m) => [m.id, m.name])),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so content text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(applicationsJsonLd(dict, a, locale, PATH)).replace(/</g, "\\u003c") }}
      />
      <Header t={dict} locale={locale} path={PATH} />
      <EditScope on={edit} entry="page.applications" label="صفحهٔ کاربردها">
        <main id="main" className={styles.page}>
          <AppHero c={a.hero} industries={a.industries.items} locale={locale} />
          <IndustryShowcase c={a.industries} locale={locale} />
          <FinderSection c={a.finder} industries={a.industries.items} refs={refs} locale={locale} />
          <Engineering c={a.engineering} locale={locale} />
        </main>
      </EditScope>
      <ContactCTA t={dict} locale={locale} footerOnly />
      <Reveals />
      <TouchFeedback />
    </>
  );
}
