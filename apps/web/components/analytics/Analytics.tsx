"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/settings";
import type { Locale } from "@/lib/i18n/config";

const KEY = "arapoush:analytics-consent";
const TEXT: Record<Locale, { msg: string; yes: string; no: string }> = {
  fa: { msg: "برای بهتر کردن سایت از آمار بازدید ناشناس استفاده می‌کنیم.", yes: "موافقم", no: "نه، ممنون" },
  en: { msg: "We use anonymous visit statistics to improve this site.", yes: "Accept", no: "No, thanks" },
  tr: { msg: "Siteyi geliştirmek için anonim ziyaret istatistikleri kullanıyoruz.", yes: "Kabul et", no: "Hayır, teşekkürler" },
};

/**
 * Analytics from Settings (S3). Ids only, tags built here; scripts load after the page is idle
 * (`lazyOnload`) and, when consent is on, only after the visitor accepts.
 */
export default function Analytics({ a, locale }: { a: SiteSettings["analytics"]; locale: Locale }) {
  const [choice, setChoice] = useState<"yes" | "no" | null | "unknown">("unknown");
  useEffect(() => {
    try {
      setChoice((localStorage.getItem(KEY) as "yes" | "no" | null) ?? null);
    } catch {
      setChoice(null);
    }
  }, []);
  const decide = (c: "yes" | "no") => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    setChoice(c);
  };
  const load = !a.consent || choice === "yes";
  const t = TEXT[locale];
  return (
    <>
      {a.consent && choice === null && (
        <div role="region" aria-label={t.msg} className="consent-bar">
          <p>{t.msg}</p>
          <button type="button" onClick={() => decide("yes")}>{t.yes}</button>
          <button type="button" onClick={() => decide("no")}>{t.no}</button>
        </div>
      )}
      {load && a.gtm && <Script id="gtm" strategy="lazyOnload">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${a.gtm}');`}</Script>}
      {load && a.ga4 && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${a.ga4}`} strategy="lazyOnload" />
          <Script id="ga4" strategy="lazyOnload">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${a.ga4}',{anonymize_ip:true});`}</Script>
        </>
      )}
      {load && a.clarity && <Script id="clarity" strategy="lazyOnload">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${a.clarity}");`}</Script>}
      {load && a.yandex && <Script id="ym" strategy="lazyOnload">{`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${a.yandex},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}</Script>}
      {load && a.matomo && <Script id="matomo" strategy="lazyOnload">{`var _paq=window._paq=window._paq||[];_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function(){var u=${JSON.stringify(a.matomo.url)};_paq.push(['setTrackerUrl',u+'matomo.php']);_paq.push(['setSiteId',${JSON.stringify(a.matomo.siteId)}]);var d=document,g=d.createElement('script'),s=d.getElementsByTagName('script')[0];g.async=true;g.src=u+'matomo.js';s.parentNode.insertBefore(g,s);})();`}</Script>}
    </>
  );
}
