import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import ContactCTA from "@/components/sections/ContactCTA";
import Reveals from "@/components/motion/Reveals";
import TouchFeedback from "@/components/motion/TouchFeedback";
import EditScope from "@/components/opex/EditScope";
import ContactHero from "@/components/contact/ContactHero";
import Directory from "@/components/contact/Directory";
import Locations from "@/components/contact/Locations";
import Faq from "@/components/contact/Faq";
import { Careers, Feedback, RequestSection } from "@/components/contact/ContactForms";
import printStyles from "@/components/printing/Printing.module.css";
import styles from "@/components/contact/Contact.module.css";
import { getDictionary, isLocale, locales } from "@/lib/i18n";
import { contactJsonLd, languageAlternates, pageUrl, jsonLdHtml, ogBase } from "@/lib/seo";
import { contactPath } from "@/lib/site";
import { getContactPage, pageForm, t } from "@/lib/contact";
import type { PublicForm } from "@/lib/forms";
import { ensureContent } from "@/lib/content";
import { editMode } from "@/lib/content/edit";

const PATH = contactPath;
type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const c = getContactPage();
  const title = t(c.meta.title, locale);
  const description = t(c.meta.description, locale);
  const url = pageUrl(locale, PATH);
  const hero = getDictionary(locale).media.contact.hero;
  const og = { url: hero.src, width: hero.width, height: hero.height, alt: t(c.hero.imageAlt, locale) };
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(PATH) },
    openGraph: { type: "website", url, title, description, ...ogBase(locale, getDictionary(locale).common.brand), images: [og] },
    twitter: { card: "summary_large_image", title, description, images: [og.url] },
  };
}

/**
 * Contact: one page for what arapoush.com spread over eight (contact, sales, laboratory, quality
 * control, careers, FAQ, suggestions, complaints). Every section reads `page.contact`; forms are
 * the OPEX forms of the same names, so each submission becomes a helpdesk ticket.
 */
export default async function ContactPage({ params }: { params: Params }) {
  await ensureContent();
  const edit = await editMode();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const c = getContactPage();
  const page = `/${locale}${PATH}`;
  const formProps = { locale, page, forms: dict.forms };
  const feedbackForms = c.feedback.tabs.map((x) => pageForm(x.form)).filter((f): f is PublicForm => !!f);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` is escaped so content text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(contactJsonLd(dict, c, locale, PATH)) }}
      />
      <Header t={dict} locale={locale} path={PATH} />
      <EditScope on={edit} entry="page.contact" label="صفحهٔ تماس">
        <main id="main" className={`${printStyles.page} ${styles.page}`}>
          <ContactHero c={c.hero} locale={locale} image={dict.media.contact.hero} />
          <Directory c={c.directory} locale={locale} />
          <Locations c={c.locations} locale={locale} images={dict.media.contact.places} />
          <RequestSection c={c.request} form={pageForm("request")} phone={c.hero.phone} phoneLabel={t(c.hero.secondary, locale)} {...formProps} />
          <Careers c={c.careers} form={pageForm("careers")} {...formProps} />
          <Feedback c={c.feedback} list={feedbackForms} {...formProps} />
          <Faq c={c.faq} locale={locale} />
        </main>
      </EditScope>
      <ContactCTA t={dict} locale={locale} footerOnly />
      <Reveals />
      <TouchFeedback />
    </>
  );
}
