import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localeMeta, locales } from "@/lib/i18n";
import { languageAlternates, pageUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import "../globals.css";

// Primary Latin typeface of the design (licensed files supplied by the client, subset to Latin).
const helvetica = localFont({
  src: [
    { path: "../fonts/helvetica-neue-300.woff2", weight: "300" },
    { path: "../fonts/helvetica-neue-400.woff2", weight: "400" },
    { path: "../fonts/helvetica-neue-500.woff2", weight: "500" },
    { path: "../fonts/helvetica-neue-700.woff2", weight: "700" },
  ],
  variable: "--font-helvetica",
  display: "swap",
  // Not preloaded: the size-adjusted fallback holds layout while the hero image wins the bandwidth.
  preload: false,
  fallback: ["Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
});

// Persian script (OFL). Arabic-script subset only: Latin falls through to Helvetica Neue.
const vazirmatn = localFont({
  src: [
    { path: "../fonts/vazirmatn-arabic-300-normal.woff2", weight: "300" },
    { path: "../fonts/vazirmatn-arabic-400-normal.woff2", weight: "400" },
    { path: "../fonts/vazirmatn-arabic-500-normal.woff2", weight: "500" },
    { path: "../fonts/vazirmatn-arabic-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-vazir",
  display: "swap",
  fallback: ["Tahoma", "sans-serif"],
});

// Self-hosted (OFL) so builds and first paint never depend on a font CDN.
const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-300-normal.woff2", weight: "300" },
    { path: "../fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/inter-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/inter-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// The hero wordmark is set in JetBrains Mono Bold in the Figma file.
const jetbrains = localFont({
  src: [{ path: "../fonts/jetbrains-mono-latin-700-normal.woff2", weight: "700" }],
  variable: "--font-jetbrains",
  display: "block",
});

type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const url = pageUrl(locale);
  const image = { url: "/images/og.jpg", width: 1200, height: 630, alt: t.common.brand };
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
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

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
      </body>
    </html>
  );
}
