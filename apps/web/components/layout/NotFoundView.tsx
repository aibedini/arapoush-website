"use client";

import { usePathname } from "next/navigation";

const TEXT = {
  fa: { title: "این صفحه پیدا نشد", lead: "شاید نشانی تغییر کرده باشد. از اینجا ادامه دهید:", home: "صفحه اصلی", tube: "تیوب چندلایه", eff: "تیوب قرص جوشان", contact: "تماس با ما" },
  en: { title: "Page not found", lead: "The address may have changed. Carry on from here:", home: "Home", tube: "Multi-layer tubes", eff: "Effervescent tubes", contact: "Contact us" },
  tr: { title: "Sayfa bulunamadı", lead: "Adres değişmiş olabilir. Buradan devam edin:", home: "Ana sayfa", tube: "Çok katmanlı tüpler", eff: "Efervesan tüpler", contact: "İletişim" },
} as const;

/** Localized 404 with ways back into the site (SEO audit: the default page had none). */
export default function NotFoundView() {
  const first = usePathname()?.split("/")[1];
  const l = first === "en" || first === "tr" ? first : "fa";
  const t = TEXT[l];
  return (
    <main id="main" className="not-found">
      <p className="not-found__code" aria-hidden="true" data-code="404" />
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <ul>
        <li><a href={`/${l}`}>{t.home}</a></li>
        <li><a href={`/${l}/products/multi-layer-tube`}>{t.tube}</a></li>
        <li><a href={`/${l}/products/effervescent-tube`}>{t.eff}</a></li>
        <li><a href={`/${l}/contact`}>{t.contact}</a></li>
      </ul>
    </main>
  );
}
