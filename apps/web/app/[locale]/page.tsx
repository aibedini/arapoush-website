import { notFound } from "next/navigation";
import PageLoader from "@/components/motion/PageLoader";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import Drift from "@/components/motion/Drift";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getAbout, t as pt } from "@/lib/about";
import { Sections, faqItems, normalizeLayout } from "@/lib/sections";
import { editMode } from "@/lib/content/edit";
import EditScope from "@/components/opex/EditScope";
import homeLayout from "@/content/home-layout.json";
import { homeJsonLd, jsonLdHtml } from "@/lib/seo";
import { ensureContent, entry } from "@/lib/content";
import { listPosts } from "@/lib/blog";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  // Section order and visibility: OPEX page.home.layout (or content/home-layout.json without OPEX).
  const layout = normalizeLayout(entry<typeof homeLayout>("page.home.layout") ?? homeLayout);
  // Newest journal posts for "Insights" (only when that section is on the page).
  const posts = layout.some((x) => x.enabled && x.type === "insights") ? (await listPosts(locale, { per: 6 })).items : [];
  const edit = await editMode();
  // FAQ blocks also become FAQPage structured data.
  const faq = faqItems(layout, locale);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so dictionary text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(homeJsonLd(t, locale)) }}
      />
      <PageLoader logo={t.media.site.logoWhite} slogan={pt(getAbout().hero.slogan, locale)} />
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }) }}
        />
      )}
      <EditScope on={edit} entry="global.site" label="سربرگ">
        <Header t={t} locale={locale} />
      </EditScope>
      <main id="main">
        <Sections layout={layout} t={t} locale={locale} edit={edit} posts={posts} />
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
