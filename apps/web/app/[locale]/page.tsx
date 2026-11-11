import { notFound } from "next/navigation";
import PageLoader from "@/components/motion/PageLoader";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import { getDictionary, isLocale } from "@/lib/i18n";
import { Sections, faqItems, normalizeLayout } from "@/lib/sections";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";
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
  const edit = await editMode();
  // FAQ blocks also become FAQPage structured data.
  const faq = faqItems(layout, locale);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd(t, locale)).replace(/</g, "\\u003c") }}
      />
      <PageLoader logo={t.media.site.logo.src} />
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }).replace(/</g, "\u003c") }}
        />
      )}
      <EditScope on={edit} entry="global.site" label="سربرگ">
        <Header t={t} locale={locale} />
      </EditScope>
      <main id="main">
        <Sections layout={layout} t={t} locale={locale} edit={edit} />
      </main>
      <EditScope on={edit} entry="global.site" label="پانویس و دعوت پایانی">
        <ContactCTA t={t} locale={locale} />
      </EditScope>
      <Reveals />
      <TouchFeedback />
      <Drift />
    </>
  );
}
