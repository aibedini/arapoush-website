"use client";

import { usePathname } from "next/navigation";

const TEXT = {
  fa: { title: "مشکلی پیش آمد", retry: "دوباره امتحان کنید", home: "صفحه اصلی" },
  en: { title: "Something went wrong", retry: "Try again", home: "Home" },
  tr: { title: "Bir sorun oluştu", retry: "Tekrar deneyin", home: "Ana sayfa" },
} as const;

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const first = usePathname()?.split("/")[1];
  const l = first === "en" || first === "tr" ? first : "fa";
  const t = TEXT[l];
  return (
    <main id="main" className="not-found">
      <h1>{t.title}</h1>
      <ul>
        <li><button type="button" onClick={reset}>{t.retry}</button></li>
        <li><a href={`/${l}`}>{t.home}</a></li>
      </ul>
    </main>
  );
}
