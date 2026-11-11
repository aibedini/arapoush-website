import { notFound } from "next/navigation";
import PageLoader from "@/components/motion/PageLoader";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import { getDictionary, isLocale } from "@/lib/i18n";
import { Sections, normalizeLayout } from "@/lib/sections";
import homeLayout from "@/content/home-layout.json";
import { homeJsonLd } from "@/lib/seo";
import { ensureContent, entry } from "@/lib/content";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  // Section order and visibility: OPEX page.home.layout (or content/home-layout.json without OPEX).
  const layout = normalizeLayout(entry<typeof homeLayout>("page.home.layout") ?? homeLayout);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd(t, locale)).replace(/</g, "\\u003c") }}
      />
      <PageLoader logo={t.media.site.logo.src} />
      <Header t={t} locale={locale} />
      <main id="main">
        <Sections layout={layout} t={t} locale={locale} />
      </main>
      <ContactCTA t={t} locale={locale} />
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
