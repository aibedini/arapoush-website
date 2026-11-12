import type { Metadata, Viewport } from "next";
import { helvetica, inter, jetbrains, vazirmatn } from "../fonts";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import "../globals.css";
import { ensureContent } from "@/lib/content";
import { editMode } from "@/lib/content/edit";
import EditBridgeLoader from "@/components/opex/EditBridgeLoader";



type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const url = pageUrl(locale);
  const og = t.media.site.og;
  const image = { url: og.src, width: og.width, height: og.height, alt: t.common.brand };
  return {
    metadataBase: new URL(siteUrl),
    title: t.meta.title,
    description: t.meta.description,
    applicationName: t.common.brand,
    alternates: { canonical: url, languages: languageAlternates() },
    openGraph: {
      type: "website",
      url,
      siteName: t.common.brand,
      title: t.meta.title,
      description: t.meta.description,
      locale: localeMeta[locale].og,
      alternateLocale: locales.filter((l) => l !== locale).map((l) => localeMeta[l].og),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description, images: [image.url] },
    // Draft previews from the OPEX console are never indexed.
    robots: (await draftMode()).isEnabled ? { index: false, follow: false } : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const edit = await editMode();

  return (
    <html
      lang={locale}
      dir={localeMeta[locale].dir}
      className={`${helvetica.variable} ${vazirmatn.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks JS availability before first paint so the loader only shows when it can finish. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js');try{if(sessionStorage.getItem('arapoush:intro-seen')||matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('no-loader')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t.common.skip}
        </a>
        {children}
        {edit && <EditBridgeLoader consoleOrigin={process.env.OPEX_CONSOLE_ORIGIN ?? ""} />}
      </body>
    </html>
  );
}
